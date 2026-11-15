// Package oparchive expires operational backup archive keys and their files.
package oparchive

import (
	"context"
	"os"
	"path/filepath"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sicza95/cali-restore-pro/server/internal/httpjson"
	"github.com/sicza95/cali-restore-pro/server/internal/objectstore"
)

// Expire deletes expired archive keys and the archive files without a live key.
// Expired keys are unusable at the restore boundary even when the worker is
// offline. On restart the worker removes expired keys and their archive files.
func Expire(ctx context.Context, pool *pgxpool.Pool, root string) error {
	if _, err := pool.Exec(ctx, `DELETE FROM operational_archive_keys WHERE expires_at<=clock_timestamp()`); err != nil {
		return err
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return err
	}
	removed := false
	for _, entry := range entries {
		name := entry.Name()
		id, ext, found := strings.Cut(name, ".")
		if !found || !httpjson.UUID(id) || (ext != "bin" && ext != "pending") {
			continue
		}
		var retained bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM operational_archive_keys
 WHERE id=$1 AND expires_at>clock_timestamp())`, id).Scan(&retained); err != nil {
			return err
		}
		if !retained {
			if err := os.Remove(filepath.Join(root, name)); err != nil {
				return err
			}
			removed = true
		}
	}
	if removed {
		return objectstore.SyncDir(root)
	}
	return nil
}
