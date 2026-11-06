package identity

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPostgresForcedAccountDeletion(t *testing.T) {
	admin, app := identityDB(t)
	ctx := context.Background()
	s, err := New(app)
	if err != nil {
		t.Fatal(err)
	}
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := admin.Exec(ctx, query, args...); err != nil {
			t.Fatal(err)
		}
	}
	assert := func(query string, args ...any) {
		t.Helper()
		var ok bool
		if err := admin.QueryRow(ctx, query, args...).Scan(&ok); err != nil || !ok {
			t.Fatalf("assertion failed: %s: %v", query, err)
		}
	}
	const operator = "b0000000-0000-4000-8000-000000000001"
	const departing = "b0000000-0000-4000-8000-000000000002"
	const survivor = "b0000000-0000-4000-8000-000000000003"
	const collaborator = "b0000000-0000-4000-8000-000000000004"
	const shared = "c0000000-0000-4000-8000-000000000001"
	const sole = "c0000000-0000-4000-8000-000000000002"
	const trash = "c0000000-0000-4000-8000-000000000003"
	const file = "f0000000-0000-4000-8000-000000000001"
	const grant = "a0000000-0000-4000-8000-000000000001"
	hash, err := HashPassword(testPassword)
	if err != nil {
		t.Fatal(err)
	}
	sessionFor := func(id, email, role string) string {
		t.Helper()
		exec(`INSERT INTO accounts(id,email,password_hash,role,state,server_features,quota_mib)
 VALUES($1,$2,$3,$4,'active',true,10)`, id, email, hash, role)
		raw := token()
		exec("INSERT INTO sessions(account_id,token_digest) VALUES($1,$2)", id, digest(raw))
		return raw
	}
	op := sessionFor(operator, "forced-operator@example.test", "superuser")
	departingSession := sessionFor(departing, "forced-owner@example.test", "member")
	coOwner := sessionFor(survivor, "forced-survivor@example.test", "member")
	reader := sessionFor(collaborator, "forced-reader@example.test", "member")
	for _, project := range []string{shared, sole, trash} {
		exec(`WITH p AS (INSERT INTO hosted_projects(id,host_id) VALUES($1,$2) RETURNING id,host_id)
 INSERT INTO project_owners SELECT id,host_id FROM p`, project, departing)
	}
	exec("INSERT INTO project_owners VALUES ($1,$2)", shared, survivor)
	exec("INSERT INTO hosting_transfers(project_id,from_id,to_id) VALUES($1,$2,$3)", shared, departing, survivor)
	exec("INSERT INTO project_deletions(id,recover_until) VALUES($1,clock_timestamp()+interval '24 hours')", trash)
	exec("INSERT INTO encrypted_files(id,project_id,source_bytes,manifest_bytes,state) VALUES($1,$2,1,17,'committed')", file, sole)
	exec(`INSERT INTO project_invitations(id,project_id,recipient_id,recipient_email,state)
 VALUES($1,$2,$3,'forced-reader@example.test','active')`, grant, sole, collaborator)
	exec("INSERT INTO sharing_identities(account_id,public_key) VALUES($1,repeat('A',88))", departing)
	exec(`INSERT INTO invitation_grants(invitation_id,sender_id,encapsulation,ciphertext)
 VALUES($1,$2,repeat('A',88),repeat('A',24))`, grant, departing)
	exec("INSERT INTO invitation_originals(invitation_id,file_id,source_id) VALUES($1,$2,$2)", grant, file)

	remove := func(id string, purge, force bool) error {
		return s.withFileLock(ctx, op, lifecycleWriteLock, func(a fileAccess) error {
			_, err := a.deleteAccount(ctx, id, purge, force)
			return err
		})
	}
	if err := remove(departing, false, false); !errors.Is(err, ErrConflict) {
		t.Fatalf("voluntary continuity guard: %v", err)
	}
	if err := remove(operator, false, true); !errors.Is(err, ErrConflict) {
		t.Fatalf("last superuser guard: %v", err)
	}
	const origin = "http://localhost"
	mux := http.NewServeMux()
	NewHTTP(s, origin, false).Register(mux)
	post := func(path, raw string, expected int) {
		t.Helper()
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"confirm":true,"force":true}`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Origin", origin)
		req.Header.Set("X-CSRF-Token", CSRF(raw))
		req.AddCookie(&http.Cookie{Name: "calirestore_session", Value: raw})
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != expected {
			t.Fatalf("deletion status %d, want %d: %s", rec.Code, expected, rec.Body)
		}
	}
	const path = "/api/v1/admin/accounts/" + departing + "/deletion"
	post("/api/v1/account/deletion", departingSession, http.StatusBadRequest)
	post(path, coOwner, http.StatusForbidden)
	post("/api/v1/admin/accounts/"+operator+"/deletion", op, http.StatusForbidden)
	exec("UPDATE sessions SET verified_at=clock_timestamp()-interval '10 minutes' WHERE account_id=$1", operator)
	post(path, op, http.StatusForbidden)
	exec("UPDATE sessions SET verified_at=clock_timestamp() WHERE account_id=$1", operator)
	post(path, op, http.StatusOK)
	if _, err := s.Current(ctx, departingSession); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("departing session: %v", err)
	}
	assert("SELECT host_id IS NULL FROM hosted_projects WHERE id=$1", shared)
	assert("SELECT NOT EXISTS(SELECT 1 FROM project_owners WHERE project_id=$1 AND account_id=$2)", shared, departing)
	assert("SELECT NOT EXISTS(SELECT 1 FROM hosting_transfers WHERE project_id=$1)", shared)
	assert(`SELECT p.recover_until=d.recover_until FROM project_deletions p
 JOIN account_deletions d ON d.id=p.forced_account_id WHERE p.id=$1`, sole)
	read := func() error {
		return s.withFiles(ctx, reader, func(a fileAccess) error {
			_, err := a.sharedFileProject(ctx, grant, file)
			return err
		})
	}
	if err := read(); err != nil {
		t.Fatalf("existing collaborator lost scoped read: %v", err)
	}
	if err := s.withFiles(ctx, reader, func(a fileAccess) error { return a.requireProjectOwner(ctx, sole) }); !errors.Is(err, errFileMissing) {
		t.Fatalf("collaborator gained ownership: %v", err)
	}
	claim := func() error {
		return s.withFiles(ctx, coOwner, func(a fileAccess) error { return a.proposeHostingTransfer(ctx, shared, survivor) })
	}
	exec("UPDATE accounts SET server_features=false WHERE id=$1", survivor)
	if err := claim(); !errors.Is(err, ErrForbidden) {
		t.Fatalf("ineligible owner claimed hosting: %v", err)
	}
	exec("UPDATE accounts SET server_features=true WHERE id=$1", survivor)
	if err := claim(); err != nil {
		t.Fatal(err)
	}
	if err := s.recoverAccount(ctx, "forced-owner@example.test", testPassword); err != nil {
		t.Fatal(err)
	}
	assert("SELECT NOT EXISTS(SELECT 1 FROM project_deletions WHERE id=$1)", sole)
	assert("SELECT forced_account_id IS NULL FROM project_deletions WHERE id=$1", trash)
	assert("SELECT host_id=$2 FROM hosted_projects WHERE id=$1", shared, survivor)
	assert("SELECT NOT EXISTS(SELECT 1 FROM project_owners WHERE project_id=$1 AND account_id=$2)", shared, departing)
	if err := remove(departing, false, true); err != nil {
		t.Fatal(err)
	}
	if err := remove(departing, true, false); err != nil {
		t.Fatal(err)
	}
	if err := read(); !errors.Is(err, errFileMissing) {
		t.Fatalf("collaborator read after deadline: %v", err)
	}
	root := t.TempDir()
	if err := s.PurgeDeleted(ctx, root); err != nil {
		t.Fatal(err)
	}
	assert("SELECT EXISTS(SELECT 1 FROM accounts WHERE id=$1)", departing)
	if err := s.PurgeDeleted(ctx, root); err != nil {
		t.Fatal(err)
	}
	assert("SELECT NOT EXISTS(SELECT 1 FROM accounts WHERE id=$1)", departing)
	assert("SELECT count(*)=2 FROM project_deletions WHERE id IN ($1,$2) AND purged_at IS NOT NULL", sole, trash)
	assert("SELECT host_id=$2 FROM hosted_projects WHERE id=$1", shared, survivor)
}
