package identity

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPostgresProjectRevisions(t *testing.T) {
	admin, app := identityDB(t)
	ctx := context.Background()
	s, err := New(app)
	if err != nil {
		t.Fatal(err)
	}
	account := func(email string) (id, raw string) {
		t.Helper()
		err := admin.QueryRow(ctx, `INSERT INTO accounts(email,password_hash,state,role,server_features,quota_mib)
 VALUES ($1,'synthetic','active','member',true,1) RETURNING id`, email).Scan(&id)
		if err != nil {
			t.Fatal(err)
		}
		raw = token()
		if _, err := admin.Exec(ctx, `INSERT INTO sessions(account_id,token_digest) VALUES ($1,$2)`, id, digest(raw)); err != nil {
			t.Fatal(err)
		}
		return
	}
	alice, aliceToken := account("alice@example.test")
	bob, bobToken := account("bob@example.test")
	const project = "c0ffee00-0000-4000-8000-000000000007"
	const path = "/api/v1/hosted-projects/" + project
	const origin = "https://test.example"
	h := NewHTTP(s, origin, false)
	h.EnableFiles(t.TempDir())
	mux := http.NewServeMux()
	h.Register(mux)
	call := func(method, suffix, id, raw string, value any, status int) *httptest.ResponseRecorder {
		t.Helper()
		body, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		r := httptest.NewRequest(method, path+suffix, bytes.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Origin", origin)
		r.Header.Set("X-CSRF-Token", CSRF(raw))
		r.Header.Set("X-Sync-Account", id)
		r.AddCookie(&http.Cookie{Name: h.cookieName, Value: raw})
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		if w.Code != status {
			t.Fatalf("%s %s: got %d, want %d: %s", method, suffix, w.Code, status, w.Body)
		}
		return w
	}
	const revision = "/revision"
	read := func() revisionState {
		t.Helper()
		var state revisionState
		if err := json.Unmarshal(call("GET", revision, alice, aliceToken, nil, 200).Body.Bytes(), &state); err != nil {
			t.Fatal(err)
		}
		return state
	}
	conflict := func(w *httptest.ResponseRecorder, code string) {
		t.Helper()
		var got map[string]string
		if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || got["error"] != code {
			t.Fatalf("expected %s: %s", code, w.Body)
		}
	}
	call("PUT", "", alice, aliceToken, struct{}{}, 204)
	call("GET", revision, bob, bobToken, nil, 404)
	if _, err := admin.Exec(ctx, `INSERT INTO project_owners(project_id,account_id) VALUES ($1,$2)`, project, bob); err != nil {
		t.Fatal(err)
	}
	empty := read()
	if empty.Head != nil || !uuid(empty.Epoch) {
		t.Fatalf("invalid initial state: %+v", empty)
	}
	write := func(expected int, epoch string, fill byte) revisionWrite {
		return revisionWrite{Expected: &expected, Epoch: epoch, revisionCiphertext: revisionCiphertext{
			Salt: bytes.Repeat([]byte{fill}, 32), Ciphertext: bytes.Repeat([]byte{fill}, 24),
		}}
	}
	first := write(0, empty.Epoch, 1)
	call("PUT", revision, alice, bobToken, first, 403)
	call("PUT", revision, bob, bobToken, first, 200)
	call("PUT", revision, bob, bobToken, first, 200) // lost response
	stale := write(0, empty.Epoch, 2)
	conflict(call("PUT", revision, alice, aliceToken, stale, 409), "revision_conflict")
	if current := read(); current.Head.Revision != 1 || !bytes.Equal(current.Head.Ciphertext, first.Ciphertext) {
		t.Fatalf("stale write replaced the head: %+v", current.Head)
	}
	second := write(1, empty.Epoch, 3)
	call("PUT", revision, alice, aliceToken, second, 200)
	call("POST", "/owners/"+bob+"/remove", alice, aliceToken, struct{}{}, 204)
	call("GET", revision, bob, bobToken, nil, 404)
	call("PUT", revision, bob, bobToken, second, 404)
	conflict(call("PUT", revision, alice, aliceToken, second, 409), "revision_epoch_changed")
	rotated := read()
	if rotated.Epoch == empty.Epoch || rotated.Head.Revision != 2 || rotated.Head.Epoch != empty.Epoch {
		t.Fatalf("revocation lost or relabelled the saved head: %+v", rotated)
	}
	// A current-epoch write must still wait for outstanding original grants.
	file := "c0ffee00-0000-4000-8000-000000000008"
	_, err = admin.Exec(ctx, `WITH file AS (
 INSERT INTO encrypted_files(id,project_id,source_bytes,manifest_bytes,state)
 VALUES ($1,$2,1,17,'committed') RETURNING id
 ), invitation AS (
 INSERT INTO project_invitations(project_id,recipient_id,recipient_email,state)
 VALUES ($2,$3,'bob@example.test','active') RETURNING id
 ), identity AS (
 INSERT INTO sharing_identities(account_id,public_key) VALUES ($4,repeat('A',88)) RETURNING account_id
 ), grant_row AS (
 INSERT INTO invitation_grants(invitation_id,sender_id,encapsulation,ciphertext)
 SELECT id,account_id,repeat('A',88),repeat('A',24) FROM invitation CROSS JOIN identity RETURNING invitation_id
 ), link AS (
 INSERT INTO invitation_originals(invitation_id,file_id,source_id)
 SELECT invitation_id,id,id FROM grant_row CROSS JOIN file
 )
 INSERT INTO retired_originals(file_id) SELECT id FROM file`, file, project, bob, alice)
	if err != nil {
		t.Fatal(err)
	}
	call("GET", revision, bob, bobToken, nil, 404) // active share does not grant owner sync access
	next := write(2, rotated.Epoch, 4)
	conflict(call("PUT", revision, alice, aliceToken, next, 409), "original_rotation_pending")
	if _, err := admin.Exec(ctx, `DELETE FROM invitation_originals WHERE file_id=$1`, file); err != nil {
		t.Fatal(err)
	}
	if _, err := admin.Exec(ctx, `UPDATE accounts SET quota_mib=0 WHERE id=$1`, alice); err != nil {
		t.Fatal(err)
	}
	conflict(call("PUT", revision, alice, aliceToken, next, 409), "storage_quota_exceeded")
	if _, err := admin.Exec(ctx, `UPDATE accounts SET quota_mib=1 WHERE id=$1`, alice); err != nil {
		t.Fatal(err)
	}
	call("PUT", revision, alice, aliceToken, next, 200)
}
