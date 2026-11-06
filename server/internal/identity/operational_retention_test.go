package identity

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestPostgresOperationalArchiveExpiry(t *testing.T) {
	admin, app := identityDB(t)
	ctx := context.Background()
	s, err := New(app)
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	current := "a0000000-0000-4000-8000-000000000001"
	expired := "a0000000-0000-4000-8000-000000000002"
	orphan := "a0000000-0000-4000-8000-000000000003"
	if _, err := admin.Exec(ctx, `INSERT INTO operational_archive_keys VALUES
 ($1,repeat('0',64),clock_timestamp()+interval '1 day'),
 ($2,repeat('0',64),clock_timestamp()-interval '1 second')`, current, expired); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{current + ".bin", expired + ".bin", orphan + ".pending"} {
		if err := os.WriteFile(filepath.Join(root, name), []byte("synthetic archive bytes"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for range 2 {
		if err := s.ExpireOperationalArchives(ctx, root); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := os.Stat(filepath.Join(root, current+".bin")); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{expired + ".bin", orphan + ".pending"} {
		if _, err := os.Stat(filepath.Join(root, name)); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("archive still on disk: %s, %v", name, err)
		}
	}
	var count int
	if err := admin.QueryRow(ctx, `SELECT count(*) FROM operational_archive_keys`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("archive key retention: %d, %v", count, err)
	}
}
