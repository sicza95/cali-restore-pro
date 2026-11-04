package migrations

import (
	"context"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// TEST_DATABASE_URL must select an isolated, disposable database owned by the
// test migrator. Never point it at a development or production database.
func TestPostgresMigrations(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if _, err := pool.Exec(ctx, `DROP TABLE IF EXISTS schema_migrations; DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='calirestore_app') THEN CREATE ROLE calirestore_app; END IF; END $$`); err != nil {
		t.Fatal(err)
	}
	if err := Check(ctx, pool); err == nil {
		t.Fatal("unmigrated database ready")
	}
	var wg sync.WaitGroup
	for range 3 {
		wg.Go(func() {
			if err := Apply(ctx, pool); err != nil {
				t.Error(err)
			}
		})
	}
	wg.Wait()
	if err := Check(ctx, pool); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM schema_migrations").Scan(&count); err != nil || count != 1 {
		t.Fatalf("migration count %d: %v", count, err)
	}
	// Use a dedicated acquired connection so role checks cannot hop pool sessions.
	conn, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(ctx, `SET ROLE calirestore_app`); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(ctx, `CREATE TABLE forbidden (id int)`); err == nil {
		t.Error("application role can create schema")
	}
	if _, err := conn.Exec(ctx, `UPDATE schema_migrations SET checksum='changed'`); err == nil {
		t.Error("application role can modify migrations")
	}
	_, _ = conn.Exec(ctx, `RESET ROLE`)
	conn.Release()
	// Ensure pooled administrative connections are reset before mutation checks.
	pool.Reset()
	if _, err := pool.Exec(ctx, `UPDATE schema_migrations SET checksum='tampered'`); err != nil {
		t.Fatal(err)
	}
	if err := Apply(ctx, pool); err == nil {
		t.Fatal("modified applied migration accepted")
	}
	if err := Check(ctx, pool); err == nil {
		t.Fatal("modified applied migration ready")
	}
}
