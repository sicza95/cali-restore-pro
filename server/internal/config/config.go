package config

import (
	"errors"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type Config struct {
	Mode, Address, Origin, StaticDir, ObjectDir, HeartbeatFile string
	DatabaseURL                                                string
	ShutdownTimeout                                            time.Duration
}

func Load() (Config, error) { return load(os.Getenv, os.ReadFile) }

func load(env func(string) string, read func(string) ([]byte, error)) (Config, error) {
	get := func(key, fallback string) string {
		if s := env(key); s != "" {
			return s
		}
		return fallback
	}
	c := Config{Mode: get("APP_ENV", "development"), Address: get("HTTP_ADDR", ":8080"), Origin: get("APP_ORIGIN", "http://localhost:8080"), StaticDir: get("STATIC_DIR", "/app/web"), ObjectDir: get("OBJECT_DIR", "/data/objects"), HeartbeatFile: get("WORKER_HEARTBEAT_FILE", "/tmp/worker-heartbeat"), ShutdownTimeout: 10 * time.Second}
	if c.Mode != "development" && c.Mode != "production" {
		return c, errors.New("APP_ENV must be development or production")
	}
	u, err := url.Parse(c.Origin)
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") || (u.Scheme != "http" && u.Scheme != "https") {
		return c, errors.New("APP_ORIGIN must be an HTTP(S) origin")
	}
	if c.Mode == "production" && u.Scheme != "https" {
		return c, errors.New("production APP_ORIGIN requires HTTPS")
	}
	if _, _, err := net.SplitHostPort(c.Address); err != nil {
		return c, errors.New("HTTP_ADDR must be host:port")
	}
	for _, p := range []string{c.StaticDir, c.ObjectDir, c.HeartbeatFile} {
		if !filepath.IsAbs(p) {
			return c, errors.New("runtime paths must be absolute")
		}
	}
	password, passwordFile := env("DB_PASSWORD"), env("DB_PASSWORD_FILE")
	if password != "" && passwordFile != "" {
		return c, errors.New("set only one of DB_PASSWORD and DB_PASSWORD_FILE")
	}
	if passwordFile != "" {
		b, err := read(passwordFile)
		if err != nil {
			return c, errors.New("cannot read DB_PASSWORD_FILE")
		}
		password = strings.TrimRight(string(b), "\r\n")
	}
	if len(password) < 32 {
		return c, errors.New("database password must contain at least 32 bytes")
	}
	if c.Mode == "production" && passwordFile == "" {
		return c, errors.New("production requires DB_PASSWORD_FILE")
	}
	user := env("DB_USER")
	if user == "" {
		return c, errors.New("DB_USER is required")
	}
	ssl := get("DB_SSLMODE", "verify-full")
	if ssl != "disable" && ssl != "verify-full" {
		return c, errors.New("DB_SSLMODE must be disable (private network) or verify-full")
	}
	db := &url.URL{Scheme: "postgres", Host: net.JoinHostPort(get("DB_HOST", "db"), get("DB_PORT", "5432")), Path: "/" + get("DB_NAME", "calirestore"), User: url.UserPassword(user, password)}
	q := db.Query()
	q.Set("sslmode", ssl)
	q.Set("connect_timeout", "5")
	db.RawQuery = q.Encode()
	c.DatabaseURL = db.String()
	return c, nil
}
