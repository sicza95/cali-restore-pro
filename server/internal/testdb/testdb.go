// Package testdb gives Postgres tests a disposable, migrated database. It is
// imported by tests only.
package testdb

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sicza95/cali-restore-pro/server/migrations"
)

// Password is the synthetic password test accounts are created with.
const Password = "synthetic identity test password"

// New returns an owner pool and a pool that runs as the restricted app role.
// Each call gets an independent disposable database; migration-history
// tampering in the migrations suite cannot race identity tests.
func New(t *testing.T) (*pgxpool.Pool, *pgxpool.Pool) {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	root, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(root.Close)
	if _, err := root.Exec(ctx, `SELECT pg_advisory_xact_lock(72401600); DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='calirestore_app') THEN CREATE ROLE calirestore_app; END IF; END $$`); err != nil {
		t.Fatal(err)
	}
	dbName := fmt.Sprintf("identity_test_%d", time.Now().UnixNano())
	if _, err := root.Exec(ctx, "CREATE DATABASE "+dbName); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = root.Exec(ctx, "DROP DATABASE "+dbName+" WITH (FORCE)") })
	c, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	c.ConnConfig.Database = dbName
	admin, err := pgxpool.NewWithConfig(ctx, c)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(admin.Close)
	if err := migrations.Apply(ctx, admin); err != nil {
		t.Fatal(err)
	}
	appConfig := c.Copy()
	appConfig.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		_, err := conn.Exec(ctx, "SET ROLE calirestore_app")
		return err
	}
	app, err := pgxpool.NewWithConfig(ctx, appConfig)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Close)
	return admin, app
}
