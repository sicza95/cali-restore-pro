package identity

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestPostgresDeletionRecoveryAndInterruptedPurge(t *testing.T) {
	admin, app := identityDB(t)
	ctx := context.Background()
	s, err := New(app)
	if err != nil {
		t.Fatal(err)
	}
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := admin.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	hash, err := HashPassword(testPassword)
	if err != nil {
		t.Fatal(err)
	}
	account := func(email string) (id, raw string) {
		t.Helper()
		if err := admin.QueryRow(ctx, `INSERT INTO accounts(email,password_hash,state,server_features,quota_mib)
 VALUES($1,$2,'active',true,10) RETURNING id`, email, hash).Scan(&id); err != nil {
			t.Fatal(err)
		}
		raw = token()
		exec("INSERT INTO sessions(account_id,token_digest) VALUES($1,$2)", id, digest(raw))
		return
	}
	host, hostSession := account("deletion-host@example.test")
	departing, departingSession := account("deletion-departing@example.test")
	project := "c0ffee00-0000-4000-8000-000000000000"
	file := "f11e0000-0000-4000-8000-000000000000"
	exec(`WITH created AS (INSERT INTO hosted_projects(id,host_id) VALUES($1,$2) RETURNING id,host_id)
 INSERT INTO project_owners SELECT id,host_id FROM created`, project, host)
	exec(`INSERT INTO project_owners VALUES ($1,$2)`, project, departing)
	exec(`INSERT INTO encrypted_files(id,project_id,source_bytes,manifest_bytes,state) VALUES($1,$2,1,17,'committed')`, file, project)
	change := func(raw, action string) (result deletionStatus, err error) {
		err = s.withFileLock(ctx, raw, lifecycleWriteLock, func(a fileAccess) error {
			result, err = a.projectDeletion(ctx, project, action)
			return err
		})
		return
	}
	removeAccount := func(raw, id string, purge bool) error {
		return s.withFileLock(ctx, raw, lifecycleWriteLock, func(a fileAccess) error {
			_, err := a.deleteAccount(ctx, id, purge, false)
			return err
		})
	}
	if err := removeAccount(hostSession, host, false); !errors.Is(err, ErrConflict) {
		t.Fatalf("hosting continuity: %v", err)
	}
	status, err := change(hostSession, "delete")
	if err != nil || status.BackupExpiresAt.Sub(status.RecoverUntil) != 60*24*time.Hour {
		t.Fatalf("deletion deadlines: %+v %v", status, err)
	}
	retry, err := change(hostSession, "delete")
	if err != nil || !retry.RecoverUntil.Equal(status.RecoverUntil) {
		t.Fatalf("retry changed deadline: %+v %v", retry, err)
	}
	if err := s.withFiles(ctx, hostSession, func(a fileAccess) error { return a.hosts(ctx, project) }); !errors.Is(err, errFileMissing) {
		t.Fatalf("trashed project accessible: %v", err)
	}
	if err := removeAccount(departingSession, departing, false); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Current(ctx, departingSession); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("departing session still active: %v", err)
	}
	if err := s.recoverAccount(ctx, "deletion-departing@example.test", testPassword); err != nil {
		t.Fatal(err)
	}
	resumed, err := s.Login(ctx, "deletion-departing@example.test", testPassword, "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := change(resumed, "recover"); !errors.Is(err, errFileMissing) {
		t.Fatalf("recovery rejoined project: %v", err)
	}
	exec("UPDATE accounts SET server_features=false WHERE id=$1", host)
	if _, err := change(hostSession, "recover"); !errors.Is(err, ErrConflict) {
		t.Fatalf("ineligible host recovered project: %v", err)
	}
	exec("UPDATE accounts SET server_features=true WHERE id=$1", host)
	if _, err := change(hostSession, "recover"); err != nil {
		t.Fatal(err)
	}
	if _, err := change(hostSession, "purge"); err != nil {
		t.Fatal(err)
	}
	if _, err := change(hostSession, "recover"); !errors.Is(err, ErrConflict) {
		t.Fatalf("early purge still recoverable: %v", err)
	}
	root := t.TempDir()
	broken := filepath.Join(root, "not-a-directory")
	if err := os.WriteFile(broken, []byte("failure injection"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := s.PurgeDeleted(ctx, broken); err == nil {
		t.Fatal("expected object purge failure")
	}
	var pending bool
	if err := admin.QueryRow(ctx, "SELECT purged_at IS NULL FROM project_deletions WHERE id=$1", project).Scan(&pending); err != nil || !pending {
		t.Fatalf("failed purge lost durable work: %v", err)
	}
	if err := os.Mkdir(filepath.Join(root, file), 0700); err != nil {
		t.Fatal(err)
	}
	if err := s.PurgeDeleted(ctx, root); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, file)); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("file remains after retry: %v", err)
	}
	if err := removeAccount(hostSession, host, false); err != nil {
		t.Fatal(err)
	}
	exec("UPDATE account_deletions SET recover_until=clock_timestamp()-interval '1 second' WHERE id=$1", host)
	if err := s.recoverAccount(ctx, "deletion-host@example.test", testPassword); !errors.Is(err, ErrCredentials) {
		t.Fatalf("expired account recovered: %v", err)
	}
	if err := s.PurgeDeleted(ctx, root); err != nil {
		t.Fatal(err)
	}
	if err := admin.QueryRow(ctx, "SELECT purged_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM accounts WHERE id=$1) FROM account_deletions WHERE id=$1", host).Scan(&pending); err != nil || !pending {
		t.Fatalf("account or deletion marker incorrect: %v", err)
	}
}
