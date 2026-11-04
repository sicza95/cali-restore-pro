// Package migrations owns the ordered, embedded SQL history. Applied files are immutable.
package migrations

import (
	"context"
	"crypto/sha256"
	"embed"
	"fmt"
	"io/fs"
	"sort"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed *.sql
var files embed.FS

type queryer interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

func history() ([]string, map[string]string, error) {
	names, err := fs.Glob(files, "*.sql")
	if err != nil {
		return nil, nil, err
	}
	sort.Strings(names)
	sums := make(map[string]string)
	for _, name := range names {
		b, err := files.ReadFile(name)
		if err != nil {
			return nil, nil, err
		}
		sums[name] = fmt.Sprintf("%x", sha256.Sum256(b))
	}
	return names, sums, nil
}

func applied(ctx context.Context, db queryer) (map[string]string, error) {
	rows, err := db.Query(ctx, "SELECT version, checksum FROM schema_migrations ORDER BY version")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make(map[string]string)
	for rows.Next() {
		var name, sum string
		if err := rows.Scan(&name, &sum); err != nil {
			return nil, err
		}
		result[name] = sum
	}
	return result, rows.Err()
}

func Check(ctx context.Context, pool *pgxpool.Pool) error {
	names, sums, err := history()
	if err != nil {
		return err
	}
	actual, err := applied(ctx, pool)
	if err != nil {
		return err
	}
	if len(actual) != len(names) {
		return fmt.Errorf("incompatible schema version")
	}
	for _, name := range names {
		if actual[name] != sums[name] {
			return fmt.Errorf("incompatible schema checksum")
		}
	}
	return nil
}

func Apply(ctx context.Context, pool *pgxpool.Pool) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	// A transaction-scoped advisory lock serializes concurrent migration commands.
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(72401600)"); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`); err != nil {
		return err
	}
	names, sums, err := history()
	if err != nil {
		return err
	}
	actual, err := applied(ctx, tx)
	if err != nil {
		return err
	}
	for name, sum := range actual {
		if sums[name] != sum {
			return fmt.Errorf("unknown or modified migration: %s", name)
		}
	}
	for _, name := range names {
		if _, ok := actual[name]; ok {
			continue
		}
		body, err := files.ReadFile(name)
		if err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, string(body)); err != nil {
			return fmt.Errorf("migration %s failed: %w", name, err)
		}
		if _, err = tx.Exec(ctx, "INSERT INTO schema_migrations (version, checksum) VALUES ($1,$2)", name, sums[name]); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
