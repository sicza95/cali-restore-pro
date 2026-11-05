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
	if _, err := pool.Exec(ctx, `SELECT pg_advisory_xact_lock(72401600); DROP SCHEMA public CASCADE; CREATE SCHEMA public; DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='calirestore_app') THEN CREATE ROLE calirestore_app; END IF; END $$`); err != nil {
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
	checkOwnershipBackfill(t, ctx, pool)
	var count int
	names, _, err := history()
	if err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM schema_migrations").Scan(&count); err != nil || count != len(names) {
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

func checkOwnershipBackfill(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	exec := func(sql string) {
		t.Helper()
		if _, err := tx.Exec(ctx, sql); err != nil {
			t.Fatal(err)
		}
	}
	migrate := func(name string) {
		t.Helper()
		body, err := files.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		exec(string(body))
	}
	exec(`CREATE SCHEMA ownership_upgrade;
 SET LOCAL search_path TO ownership_upgrade;
 CREATE TABLE accounts (id uuid PRIMARY KEY);
 CREATE TABLE sessions (created_at timestamptz)`)
	migrate("0005_encrypted_files.sql")
	exec(`INSERT INTO accounts VALUES ('a0000000-0000-4000-8000-000000000001');
 INSERT INTO hosted_projects VALUES ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001')`)
	migrate("0006_project_ownership.sql")
	var ok bool
	err = tx.QueryRow(ctx, `SELECT EXISTS (
 SELECT 1 FROM hosted_projects p JOIN project_owners o ON o.project_id=p.id AND o.account_id=p.host_id
 WHERE p.id='b0000000-0000-4000-8000-000000000001' AND p.host_id='a0000000-0000-4000-8000-000000000001'
 )`).Scan(&ok)
	if err != nil || !ok {
		t.Fatalf("existing host was not backfilled as owner: %v", err)
	}
}
