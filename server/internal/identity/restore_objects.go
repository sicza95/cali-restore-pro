package identity

import (
	"context"
	"errors"
	"os"
	"path/filepath"

	"github.com/jackc/pgx/v5"
)

// VerifyRestoredObjects checks current committed metadata against restored
// bytes. Staged uploads belong to the interrupted source and must be retried.
func (s *Service) VerifyRestoredObjects(ctx context.Context, root string) error {
	for {
		if err := s.PurgeDeleted(ctx, root); err != nil {
			return err
		}
		var due bool
		err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM project_deletions WHERE purged_at IS NULL AND recover_until<=clock_timestamp())
 OR EXISTS(SELECT 1 FROM account_deletions WHERE purged_at IS NULL AND recover_until<=clock_timestamp())`).Scan(&due)
		if err != nil {
			return err
		}
		if !due {
			break
		}
	}
	if _, err := s.pool.Exec(ctx, `DELETE FROM encrypted_files WHERE state<>'committed'`); err != nil {
		return err
	}
	rows, err := s.pool.Query(ctx, `SELECT id::text,source_bytes,manifest_bytes FROM encrypted_files`)
	if err != nil {
		return err
	}
	type file struct {
		ID                         string
		SourceBytes, ManifestBytes int
	}
	files, err := pgx.CollectRows(rows, pgx.RowToStructByPos[file])
	if err != nil {
		return err
	}
	expected := make(map[string]bool, len(files))
	objects := fileObjects{root: root}
	for _, file := range files {
		if !uuid(file.ID) {
			return ErrInvalid
		}
		shape := fileShape{SourceBytes: file.SourceBytes, ManifestBytes: file.ManifestBytes}
		if err := verifyRestoredFile(ctx, s, objects, file.ID, shape); err != nil {
			return err
		}
		expected[file.ID] = true
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if !expected[entry.Name()] {
			if err := os.RemoveAll(filepath.Join(root, entry.Name())); err != nil {
				return err
			}
		}
	}
	return syncFileDirectory(root)
}

func verifyRestoredFile(ctx context.Context, s *Service, objects fileObjects, id string, shape fileShape) error {
	rows, err := s.pool.Query(ctx, `SELECT part,digest FROM encrypted_parts WHERE file_id=$1 ORDER BY part`, id)
	if err != nil {
		return err
	}
	defer rows.Close()
	next := 0
	for rows.Next() {
		var part int
		var hash []byte
		if err := rows.Scan(&part, &hash); err != nil {
			return err
		}
		if part != next || shape.partSize(part) == 0 {
			return errors.New("invalid restored object metadata")
		}
		if _, err := objects.read(id, part, shape.partSize(part), hash); err != nil {
			return err
		}
		next++
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if next != shape.chunks()+1 {
		return errors.New("incomplete restored object metadata")
	}
	return nil
}
