package projects

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"testing"

	"github.com/sicza95/cali-restore-pro/server/internal/identity"
	"github.com/sicza95/cali-restore-pro/server/internal/identity/passhash"
	"github.com/sicza95/cali-restore-pro/server/internal/identity/sessiontoken"
	"github.com/sicza95/cali-restore-pro/server/internal/testdb"
)

// A whole-project deletion from before the Bin is restored and purged through the Bin command.
func TestPostgresBinLegacyProject(t *testing.T) {
	admin, app := testdb.New(t)
	ctx := context.Background()
	ids, err := identity.New(app)
	if err != nil {
		t.Fatal(err)
	}
	s := New(app, ids)
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := admin.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	hash, err := passhash.Hash(testdb.Password)
	if err != nil {
		t.Fatal(err)
	}
	account := func(email string) (id, raw string) {
		t.Helper()
		if err := admin.QueryRow(ctx, `INSERT INTO accounts(email,password_hash,state,server_features,quota_mib)
 VALUES($1,$2,'active',true,10) RETURNING id`, email, hash).Scan(&id); err != nil {
			t.Fatal(err)
		}
		raw = sessiontoken.New()
		exec("INSERT INTO sessions(account_id,token_digest) VALUES($1,$2)", id, sessiontoken.Digest(raw))
		return
	}
	host, hostSession := account("legacy-host@example.test")
	orgAdmin, adminSession := account("legacy-admin@example.test")
	member, memberSession := account("legacy-member@example.test")
	var org string
	if err := admin.QueryRow(ctx, `INSERT INTO organisations(name) VALUES('Studio') RETURNING id`).Scan(&org); err != nil {
		t.Fatal(err)
	}
	exec(`INSERT INTO organisation_members(organisation_id,account_id,role) VALUES($1,$2,'admin'),($1,$3,'admin'),($1,$4,'member')`, org, host, orgAdmin, member)
	project := "c0ffee00-0000-4000-8000-0000000000c1"
	exec(`WITH created AS (INSERT INTO hosted_projects(id,host_id,organisation_id) VALUES($1,$2,$3) RETURNING id,host_id)
 INSERT INTO project_owners SELECT id,host_id FROM created`, project, host, org)
	trash := func() {
		exec(`INSERT INTO project_deletions(id,deleted_at,recover_until) VALUES($1,clock_timestamp(),clock_timestamp()+interval '720 hours')`, project)
	}
	run := func(raw, op, intent string, version int64) (out binOutcome, err error) {
		sum := sha256.Sum256([]byte(op + intent))
		cmd := binCommand{OperationID: op, Digest: hex.EncodeToString(sum[:]), WriterProtocol: binWriterProtocol, Intent: intent,
			DeletionIDs: []string{project}, ExpectedVersions: map[string]int64{project: version}}
		err = s.withFileLock(ctx, raw, lifecycleWriteLock, func(a fileAccess) error {
			out, err = a.binExecute(ctx, project, cmd)
			return err
		})
		return
	}
	is := func(err, want error, what string) {
		t.Helper()
		if !errors.Is(err, want) {
			t.Fatalf("%s: got %v, want %v", what, err, want)
		}
	}
	live := func() error {
		return s.withFiles(ctx, hostSession, func(a fileAccess) error { return a.hosts(ctx, project) })
	}

	trash()
	is(live(), errFileMissing, "trashed project")
	is(oneErr(run(memberSession, "c1000000-0000-4000-8000-000000000001", "restore", 1)), errBinForbidden, "member restore")
	exec(`UPDATE accounts SET quota_mib=0 WHERE id=$1`, host)
	exec(`INSERT INTO encrypted_files(id,project_id,source_bytes,manifest_bytes,state) VALUES('c1000000-0000-4000-8000-0000000000f1',$1,256,32,'committed')`, project)
	is(oneErr(run(adminSession, "c1000000-0000-4000-8000-000000000002", "restore", 1)), errBinQuotaExceeded, "no quota")
	exec(`UPDATE accounts SET quota_mib=10 WHERE id=$1`, host)

	// An organisation administrator restores it; a lost response replays the same receipt.
	op := "c1000000-0000-4000-8000-000000000003"
	restored, err := run(adminSession, op, "restore", 1)
	if err != nil || restored.Versions[project] != 2 || restored.Head != nil {
		t.Fatalf("restore: %+v %v", restored, err)
	}
	if err := live(); err != nil {
		t.Fatalf("restored project not live: %v", err)
	}
	if again, err := run(adminSession, op, "restore", 1); err != nil || again.Versions[project] != 2 {
		t.Fatalf("replay: %+v %v", again, err)
	}
	is(oneErr(run(hostSession, "c1000000-0000-4000-8000-000000000004", "restore", 1)), errBinNotRetained, "second restore")
	var fences int
	if err := admin.QueryRow(ctx, `SELECT count(*) FROM bin_fences WHERE project_id=$1 AND entity_id=$1 AND state='restored'`, project).Scan(&fences); err != nil || fences != 1 {
		t.Fatalf("restore fence %d: %v", fences, err)
	}

	// Deleted again: a purge brings the worker deadline forward and ends recovery.
	trash()
	is(oneErr(run(hostSession, "c1000000-0000-4000-8000-000000000007", "purge", 1)), errBinStale, "purge of the earlier deletion")
	if _, err := run(hostSession, "c1000000-0000-4000-8000-000000000005", "purge", 3); err != nil {
		t.Fatalf("purge: %v", err)
	}
	var due bool
	if err := admin.QueryRow(ctx, `SELECT recover_until<=clock_timestamp() FROM project_deletions WHERE id=$1`, project).Scan(&due); err != nil || !due {
		t.Fatalf("purge deadline: %v %v", due, err)
	}
	is(oneErr(run(hostSession, "c1000000-0000-4000-8000-000000000006", "restore", 5)), errBinExpired, "restore after purge")
}
