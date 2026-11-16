package projects

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/sicza95/cali-restore-pro/server/internal/identity"
	"github.com/sicza95/cali-restore-pro/server/internal/identity/sessiontoken"
	"github.com/sicza95/cali-restore-pro/server/internal/testdb"
)

// A revocation cancels staged uploads and the worker deletes them later. A
// write to such an upload gets the same answer before and after the worker
// has run (#90), and nobody but the host learns anything about the file.
func TestPostgresRevokedUploadStatus(t *testing.T) {
	admin, app := testdb.New(t)
	ctx := context.Background()
	ids, err := identity.New(app)
	if err != nil {
		t.Fatal(err)
	}
	s := New(app, ids)
	account := func(email string) (id, raw string) {
		t.Helper()
		err := admin.QueryRow(ctx, `INSERT INTO accounts(email,password_hash,state,role,server_features,quota_mib)
 VALUES ($1,'synthetic','active','member',true,1) RETURNING id`, email).Scan(&id)
		if err != nil {
			t.Fatal(err)
		}
		raw = sessiontoken.New()
		if _, err := admin.Exec(ctx, `INSERT INTO sessions(account_id,token_digest) VALUES ($1,$2)`, id, sessiontoken.Digest(raw)); err != nil {
			t.Fatal(err)
		}
		return
	}
	alice, aliceToken := account("alice@example.test")
	bob, bobToken := account("bob@example.test")
	const project = "c0ffee00-0000-4000-8000-000000000090"
	const path = "/api/v1/hosted-projects/" + project
	const origin = "https://test.example"
	auth := identity.NewHTTP(ids, origin, false)
	h := NewHTTP(auth, s)
	root := t.TempDir()
	h.EnableFiles(root)
	mux := http.NewServeMux()
	auth.Register(mux)
	h.Register(mux)
	call := func(method, suffix, raw string, body []byte, binary bool, status int, code string) {
		t.Helper()
		r := httptest.NewRequest(method, path+suffix, bytes.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		if binary {
			digest := sha256.Sum256(body)
			r.Header.Set("Content-Type", "application/octet-stream")
			r.Header.Set("X-Ciphertext-SHA256", hex.EncodeToString(digest[:]))
		}
		r.Header.Set("Origin", origin)
		r.Header.Set("X-CSRF-Token", sessiontoken.CSRF(raw))
		r.AddCookie(&http.Cookie{Name: auth.CookieName(), Value: raw})
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		if w.Code != status {
			t.Fatalf("%s %s: got %d, want %d: %s", method, suffix, w.Code, status, w.Body)
		}
		if code != "" {
			var got map[string]string
			if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || got["error"] != code {
				t.Fatalf("%s %s: want %s: %s", method, suffix, code, w.Body)
			}
		}
	}
	noBody := []byte("{}")
	part := bytes.Repeat([]byte{7}, 17)
	file := func(i int) string { return fmt.Sprintf("/files/f11e0000-0000-4000-8000-%012d", i) }

	call("PUT", "", aliceToken, noBody, false, 204, "")
	// An active file grant to bob, so that revoking it advances the original epoch.
	const invitation = "c0ffee00-0000-4000-8000-000000000091"
	_, err = admin.Exec(ctx, `WITH file AS (
 INSERT INTO encrypted_files(id,project_id,source_bytes,manifest_bytes,state)
 VALUES ('c0ffee00-0000-4000-8000-000000000092',$1,1,17,'committed') RETURNING id
 ), invitation AS (
 INSERT INTO project_invitations(id,project_id,recipient_id,recipient_email,state)
 VALUES ($4,$1,$2,'bob@example.test','active') RETURNING id
 ), identity AS (
 INSERT INTO sharing_identities(account_id,public_key) VALUES ($3,repeat('A',88)) RETURNING account_id
 ), grant_row AS (
 INSERT INTO invitation_grants(invitation_id,sender_id,encapsulation,ciphertext)
 SELECT id,account_id,repeat('A',88),repeat('A',24) FROM invitation CROSS JOIN identity RETURNING invitation_id
 )
 INSERT INTO invitation_originals(invitation_id,file_id,source_id)
 SELECT invitation_id,id,id FROM grant_row CROSS JOIN file`, project, bob, alice, invitation)
	if err != nil {
		t.Fatal(err)
	}
	// Two uploads staged before the revocation: one is written to before the
	// worker runs and again after, the other only after.
	for _, i := range []int{1, 2} {
		call("PUT", file(i), aliceToken, []byte(`{"sourceBytes":1,"manifestBytes":17}`), false, 200, "")
		call("PUT", file(i)+"/parts/0", aliceToken, part, true, 204, "")
	}
	call("POST", "/invitations/"+invitation+"/revoke", aliceToken, noBody, false, 204, "")

	stale := func(i int) {
		t.Helper()
		call("PUT", file(i)+"/parts/1", aliceToken, part, true, 409, "file_conflict")
		call("POST", file(i)+"/commit", aliceToken, noBody, false, 409, "file_conflict")
		call("GET", file(i), aliceToken, nil, false, 404, "not_found")
		call("GET", file(i)+"/parts/0", aliceToken, nil, false, 404, "not_found")
		// The revoked recipient is not the host: the project check refuses it
		// before the file is looked up, so it learns nothing either way.
		call("POST", file(i)+"/commit", bobToken, noBody, false, 404, "not_found")
		call("PUT", file(i)+"/parts/1", bobToken, part, true, 404, "not_found")
	}
	stale(1)

	for range 2 {
		if err := s.CleanExpiredFiles(ctx, root); err != nil {
			t.Fatal(err)
		}
	}
	var left int
	if err := admin.QueryRow(ctx, `SELECT count(*) FROM encrypted_files WHERE project_id=$1 AND state<>'committed'`, project).Scan(&left); err != nil || left != 0 {
		t.Fatalf("worker left %d cancelled uploads: %v", left, err)
	}
	stale(1)
	stale(2)
	// An id the host never reserved answers the same way: there is no
	// reservation to write to.
	call("POST", file(3)+"/commit", aliceToken, noBody, false, 409, "file_conflict")
	call("PUT", file(3)+"/parts/1", aliceToken, part, true, 409, "file_conflict")
	// Part numbers outside the file stay 404 while the reservation exists.
	call("PUT", file(4), aliceToken, []byte(`{"sourceBytes":1,"manifestBytes":17}`), false, 200, "")
	call("PUT", file(4)+"/parts/2", aliceToken, part, true, 404, "not_found")
}
