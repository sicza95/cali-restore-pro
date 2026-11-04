package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sicza95/cali-restore-pro/server/internal/config"
	"github.com/sicza95/cali-restore-pro/server/internal/platform"
	"github.com/sicza95/cali-restore-pro/server/migrations"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	if err := run(ctx, os.Args[1:]); err != nil {
		slog.Error("command failed", "reason", err.Error())
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string) error {
	if len(args) != 1 {
		return errors.New("usage: calirestore serve|worker|migrate|healthcheck|worker-healthcheck")
	}
	if args[0] == "healthcheck" {
		return healthcheck()
	}
	if args[0] == "worker-healthcheck" {
		p := os.Getenv("WORKER_HEARTBEAT_FILE")
		if p == "" {
			p = "/tmp/worker-heartbeat"
		}
		info, err := os.Stat(p)
		if err != nil || time.Since(info.ModTime()) > 20*time.Second {
			return errors.New("worker unavailable")
		}
		return nil
	}
	if args[0] != "serve" && args[0] != "worker" && args[0] != "migrate" {
		return errors.New("unknown command")
	}
	c, err := config.Load()
	if err != nil {
		return err
	}
	pc, err := pgxpool.ParseConfig(c.DatabaseURL)
	if err != nil {
		return errors.New("invalid database configuration")
	}
	pc.MaxConns = 8
	pc.MinConns = 0
	pc.MaxConnIdleTime = 5 * time.Minute
	pc.MaxConnLifetime = time.Hour
	pool, err := pgxpool.NewWithConfig(ctx, pc)
	if err != nil {
		return errors.New("cannot create database pool")
	}
	defer pool.Close()
	if args[0] == "migrate" {
		mctx, cancel := context.WithTimeout(ctx, 60*time.Second)
		defer cancel()
		if err := migrations.Apply(mctx, pool); err != nil {
			return errors.New("migration failed; check database availability, role and migration history")
		}
		slog.Info("migrations applied")
		return nil
	}
	ready := func(ctx context.Context) error { return migrations.Check(ctx, pool) }
	start, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := ready(start); err != nil {
		return errors.New("database or schema not ready; run migrations first")
	}
	if args[0] == "worker" {
		return worker(ctx, c, ready)
	}
	if _, err := os.Stat(filepath.Join(c.StaticDir, "index.html")); err != nil {
		return errors.New("frontend build missing")
	}
	srv := &http.Server{Addr: c.Address, Handler: platform.Handler(os.DirFS(c.StaticDir), ready), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 1 << 20}
	stopped := make(chan error, 1)
	go func() { stopped <- srv.ListenAndServe() }()
	slog.Info("HTTP server started")
	select {
	case err := <-stopped:
		return err
	case <-ctx.Done():
	}
	shutdown, cancel := context.WithTimeout(context.Background(), c.ShutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdown); err != nil {
		_ = srv.Close()
		return errors.New("HTTP shutdown timed out")
	}
	return nil
}

func worker(ctx context.Context, c config.Config, ready platform.Readiness) error {
	// M-00 monitors its dependencies only. Durable jobs/outbox begin at M-01.
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	defer os.Remove(c.HeartbeatFile)
	wasReady := false
	for {
		check, cancel := context.WithTimeout(ctx, 2*time.Second)
		err := ready(check)
		cancel()
		if err == nil {
			err = os.WriteFile(c.HeartbeatFile, []byte("ready\n"), 0600)
		} else {
			_ = os.Remove(c.HeartbeatFile)
		}
		isReady := err == nil
		if isReady != wasReady {
			slog.Info("worker dependency state", "ready", isReady)
			wasReady = isReady
		}
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}
	}
}

func healthcheck() error {
	u := os.Getenv("HEALTHCHECK_URL")
	if u == "" {
		u = "http://127.0.0.1:8080/health/ready"
	}
	c := http.Client{Timeout: 3 * time.Second}
	r, err := c.Get(u)
	if err != nil {
		return errors.New("app unavailable")
	}
	defer r.Body.Close()
	if r.StatusCode != 200 {
		return fmt.Errorf("app not ready: %d", r.StatusCode)
	}
	return nil
}
