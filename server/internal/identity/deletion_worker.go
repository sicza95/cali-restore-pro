package identity

import (
	"context"
	"errors"
	"os"
	"path/filepath"

	"github.com/jackc/pgx/v5"
)

// The record and file rows survive a failed purge. Bytes are removed before
// the commit and retries tolerate any directories already removed.
func (s *Service) PurgeDeleted(ctx context.Context, root string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	if _, err := tx.Exec(ctx, lifecycleWriteLock); err != nil {
		return err
	}
	if err := purgeProject(ctx, tx, root); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `WITH due AS (
 SELECT id FROM account_deletions WHERE purged_at IS NULL AND recover_until<=clock_timestamp()
 ORDER BY recover_until,id LIMIT 1
 ), removed AS (
 DELETE FROM accounts WHERE id IN (SELECT id FROM due) AND state='pending_deletion' RETURNING id
 )
 UPDATE account_deletions SET purged_at=clock_timestamp() WHERE id IN (SELECT id FROM removed)`); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM sharing_identities k
 WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id=k.account_id)
 AND NOT EXISTS (SELECT 1 FROM invitation_grants g WHERE g.sender_id=k.account_id)
 AND NOT EXISTS (SELECT 1 FROM invitation_scope_grants g WHERE g.sender_id=k.account_id)
 AND NOT EXISTS (SELECT 1 FROM invitation_checkpoint_grants g WHERE g.sender_id=k.account_id)`); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func purgeProject(ctx context.Context, tx pgx.Tx, root string) error {
	var id string
	err := tx.QueryRow(ctx, `SELECT id FROM project_deletions WHERE purged_at IS NULL AND recover_until<=clock_timestamp()
 ORDER BY recover_until,id LIMIT 1`).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	rows, err := tx.Query(ctx, `SELECT id::text FROM encrypted_files WHERE project_id=$1 FOR UPDATE`, id)
	if err != nil {
		return err
	}
	files, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return err
	}
	for _, file := range files {
		if err := ctx.Err(); err != nil {
			return err
		}
		if !uuid(file) {
			return ErrInvalid
		}
		if err := os.RemoveAll(filepath.Join(root, file)); err != nil {
			return err
		}
	}
	if len(files) > 0 {
		if err := syncFileDirectory(root); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `DELETE FROM hosted_projects WHERE id=$1`, id); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE project_deletions SET purged_at=clock_timestamp() WHERE id=$1`, id)
	return err
}
