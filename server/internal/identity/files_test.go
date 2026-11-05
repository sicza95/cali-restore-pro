package identity

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestPostgresEncryptedFiles(t *testing.T) {
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
	account := func(email string) string {
		var id string
		err := admin.QueryRow(ctx, `INSERT INTO accounts(email,password_hash,state,role,server_features,quota_mib)
  VALUES ($1,'synthetic hash','active','member',true,1) RETURNING id`, email).Scan(&id)
		if err != nil {
			t.Fatal(err)
		}
		raw := token()
		exec(`INSERT INTO sessions(account_id,token_digest) VALUES($1,$2)`, id, digest(raw))
		return raw
	}
	alice, bob := account("alice@example.test"), account("bob@example.test")
	root := t.TempDir()
	origin := "https://test.example"
	h := NewHTTP(s, origin, false)
	h.EnableFiles(root)
	mux := http.NewServeMux()
	h.Register(mux)
	request := func(method, path, raw string, body []byte, binary bool) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, bytes.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Origin", origin)
		r.Header.Set("X-CSRF-Token", CSRF(raw))
		if raw != "" {
			r.AddCookie(&http.Cookie{Name: h.cookieName, Value: raw})
		}
		if binary {
			r.Header.Set("Content-Type", "application/octet-stream")
			digest := sha256.Sum256(body)
			r.Header.Set("X-Ciphertext-SHA256", hex.EncodeToString(digest[:]))
		}
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		return w
	}
	want := func(method, path, raw string, body []byte, binary bool, status int) *httptest.ResponseRecorder {
		t.Helper()
		w := request(method, path, raw, body, binary)
		if w.Code != status {
			t.Fatalf("%s %s: got %d, want %d: %s", method, path, w.Code, status, w.Body.String())
		}
		return w
	}
	project := "/api/v1/hosted-projects/c0ffee00-0000-4000-8000-000000000000"
	id := func(i int) string { return fmt.Sprintf("f11e0000-0000-4000-8000-%012d", i) }
	file := func(i int) string { return project + "/files/" + id(i) }
	noBody := []byte("{}")
	manifest := bytes.Repeat([]byte{0x99}, 32)
	chunk := bytes.Repeat([]byte{0xaa}, 600016)
	shape := []byte(`{"sourceBytes":600000,"manifestBytes":32}`)
	want("PUT", project, "", noBody, false, 401)
	want("PUT", project, alice, noBody, false, 204)
	want("PUT", project, alice, noBody, false, 204)
	want("PUT", project, bob, noBody, false, 404)
	var owners int
	if err := admin.QueryRow(ctx, `SELECT count(*) FROM project_owners o
 JOIN hosted_projects p ON p.id=o.project_id AND p.host_id=o.account_id`).Scan(&owners); err != nil || owners != 1 {
		t.Fatalf("expected one initial owner matching the host, got %d: %v", owners, err)
	}
	if _, err := admin.Exec(ctx, `UPDATE hosted_projects SET host_id=(SELECT id FROM accounts WHERE email='bob@example.test')`); err == nil {
		t.Fatal("database accepted a host who does not own the project")
	}
	preflight := "/api/v1/account/deletion-preflight"
	if got := want("GET", preflight, alice, nil, false, 200).Body.String(); !bytes.Contains([]byte(got), []byte("hosted_projects_require_continuity")) {
		t.Fatalf("hosted owner preflight: %s", got)
	}
	if got := want("GET", preflight, bob, nil, false, 200).Body.String(); !bytes.Contains([]byte(got), []byte("project_continuity_unavailable")) {
		t.Fatalf("unhosted account preflight: %s", got)
	}
	want("PUT", file(1), bob, shape, false, 404)

	invitations := project + "/invitations"
	recipient := []byte(`{"email":"bob@example.test"}`)
	want("POST", invitations, bob, recipient, false, 404)
	want("POST", invitations, alice, recipient, false, 503)
	if err := s.ConfigureMail(make([]byte, 32), origin); err != nil {
		t.Fatal(err)
	}
	exec(`UPDATE accounts SET language='hu' WHERE email='bob@example.test'`)
	issue := func() string {
		t.Helper()
		var invite struct{ ID string }
		w := want("POST", invitations, alice, recipient, false, 201)
		if err := json.Unmarshal(w.Body.Bytes(), &invite); err != nil || !uuid(invite.ID) {
			t.Fatalf("invalid invitation: %v", err)
		}
		return invite.ID
	}
	accept := func(invite string) string { return "/api/v1/invitations/" + invite + "/accept" }
	first := issue()
	delivered := false
	err = s.DeliverMail(ctx, func(_ context.Context, to, subject, body string) error {
		delivered = true
		if to != "bob@example.test" || subject != "CaliRestore Pro projektmeghívó" ||
			!strings.HasSuffix(body, origin+"/invitations") || strings.Contains(body, first) || strings.Contains(body, "c0ffee00") {
			t.Error("invitation notification did not match recipient, language or privacy requirements")
		}
		return nil
	})
	if err != nil || !delivered {
		t.Fatalf("invitation notification was not delivered: %v", err)
	}
	for raw, visible := range map[string]bool{alice: false, bob: true} {
		inbox := want("GET", "/api/v1/invitations", raw, nil, false, 200)
		if bytes.Contains(inbox.Body.Bytes(), []byte(first)) != visible {
			t.Fatal("invitation visibility did not match the recipient")
		}
	}
	want("POST", accept(first), alice, noBody, false, 400)
	exec(`UPDATE accounts SET email='changed@example.test' WHERE email='bob@example.test'`)
	want("POST", accept(first), bob, noBody, false, 400)
	exec(`UPDATE accounts SET email='bob@example.test' WHERE email='changed@example.test'`)
	want("POST", invitations+"/"+first+"/cancel", alice, noBody, false, 204)
	second := issue()
	want("POST", accept(first), bob, noBody, false, 400)
	exec(`UPDATE project_invitations SET expires_at=now()-interval '1 second' WHERE id=$1`, second)
	want("POST", accept(second), bob, noBody, false, 400)
	third := issue()
	want("POST", accept(third), bob, noBody, false, 204)
	want("GET", invitations, bob, nil, false, 404)
	for _, w := range []*httptest.ResponseRecorder{
		want("GET", invitations, alice, nil, false, 200),
		want("GET", "/api/v1/invitations", bob, nil, false, 200),
	} {
		if !bytes.Contains(w.Body.Bytes(), []byte(`"state":"accepted"`)) {
			t.Fatal("accepted invitation disappeared before secure activation")
		}
	}
	want("POST", accept(third), bob, noBody, false, 400)
	want("PUT", file(1), bob, shape, false, 404)

	// Two concurrent requests together exceed the same hosting account's quota.
	results := make(chan int, 2)
	var wg sync.WaitGroup
	for i := 1; i <= 2; i++ {
		wg.Go(func() { results <- request("PUT", file(i), alice, shape, false).Code })
	}
	wg.Wait()
	a, b := <-results, <-results
	if a+b != 200+409 || a == b {
		t.Fatalf("quota race: %d %d", a, b)
	}
	i := 1
	if request("PUT", file(1), alice, shape, false).Code != 200 {
		i = 2
	}
	path := file(i)
	want("GET", path, alice, nil, false, 404)
	want("POST", path+"/commit", alice, noBody, false, 409)
	want("PUT", path+"/parts/0", alice, manifest, true, 204)
	want("PUT", path+"/parts/0", alice, manifest, true, 204)
	want("PUT", path+"/parts/0", alice, bytes.Repeat([]byte{2}, 32), true, 409)
	want("PUT", path+"/parts/1", alice, chunk[:10], true, 400)
	want("PUT", path+"/parts/1", alice, chunk, true, 204)
	chunkPath := filepath.Join(root, id(i), "1")
	if err := os.WriteFile(chunkPath, bytes.Repeat([]byte{3}, len(chunk)), 0600); err != nil {
		t.Fatal(err)
	}
	want("POST", path+"/commit", alice, noBody, false, 409)
	if err := os.Remove(chunkPath); err != nil {
		t.Fatal(err)
	}
	want("POST", path+"/commit", alice, noBody, false, 409)
	want("PUT", path+"/parts/1", alice, chunk, true, 204)
	exec(`UPDATE accounts SET server_features=false WHERE email='alice@example.test'`)
	want("POST", path+"/commit", alice, noBody, false, 403)
	exec(`UPDATE accounts SET server_features=true WHERE email='alice@example.test'`)
	want("POST", path+"/commit", alice, noBody, false, 204)
	want("POST", path+"/commit", alice, noBody, false, 204)
	want("PUT", path+"/parts/1", alice, chunk, true, 409)
	want("DELETE", path, alice, nil, false, 409)
	want("GET", path, bob, nil, false, 404)
	exec(`UPDATE accounts SET server_features=false,quota_mib=0 WHERE email='alice@example.test'`)
	got := want("GET", path+"/parts/1", alice, nil, false, 200)
	if !bytes.Equal(got.Body.Bytes(), chunk) {
		t.Fatal("retrieval changed bytes")
	}
	exec(`UPDATE accounts SET server_features=true,quota_mib=1 WHERE email='alice@example.test'`)
	small := []byte(`{"sourceBytes":128,"manifestBytes":32}`)
	want("PUT", file(3), alice, small, false, 200)
	want("PUT", file(3)+"/parts/0", alice, manifest, true, 204)
	want("DELETE", file(3), alice, nil, false, 204)
	want("POST", file(3)+"/commit", alice, noBody, false, 409)
	want("PUT", file(4), alice, small, false, 200)
	want("PUT", file(4)+"/parts/0", alice, manifest, true, 204)
	exec(`UPDATE encrypted_files SET expires_at=clock_timestamp()-interval '1 minute' WHERE id=$1`, id(4))
	want("PUT", file(4)+"/parts/1", alice, make([]byte, 144), true, 409)
	for range 2 {
		if err := s.CleanExpiredFiles(ctx, root); err != nil {
			t.Fatal(err)
		}
	}
	for _, i := range []int{3, 4} {
		if _, err := os.Stat(filepath.Join(root, id(i))); !os.IsNotExist(err) {
			t.Fatalf("orphan %d still present: %v", i, err)
		}
	}
	want("GET", path+"/parts/1", alice, nil, false, 200)
	if err := os.Remove(chunkPath); err != nil {
		t.Fatal(err)
	}
	want("GET", path+"/parts/1", alice, nil, false, 503)
	exec(`DELETE FROM sessions WHERE token_digest=$1`, digest(alice))
	want("GET", path, alice, nil, false, 401)
}
