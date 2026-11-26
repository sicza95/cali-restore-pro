package projects

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sicza95/cali-restore-pro/server/internal/identity"
	"github.com/sicza95/cali-restore-pro/server/internal/identity/sessiontoken"
	"github.com/sicza95/cali-restore-pro/server/internal/testdb"
)

const visibilityOrigin = "https://test.example"
const visibilityProject = "c0ffee00-0000-4000-8000-000000000031"
const visibilityPath = "/api/v1/hosted-projects/" + visibilityProject + "/visibility"

type visibilityFixture struct {
	t      *testing.T
	admin  *pgxpool.Pool
	app    *pgxpool.Pool
	auth   *identity.HTTP
	mux    *http.ServeMux
	owner  string
	co     string
	other  string
	org    string
	tokens map[string]string
}

func newVisibilityFixture(t *testing.T) *visibilityFixture {
	t.Helper()
	admin, app := testdb.New(t)
	ids, err := identity.New(app)
	if err != nil {
		t.Fatal(err)
	}
	f := &visibilityFixture{t: t, admin: admin, app: app, auth: identity.NewHTTP(ids, visibilityOrigin, false),
		mux: http.NewServeMux(), tokens: map[string]string{}}
	h := NewHTTP(f.auth, New(app, ids))
	h.EnableFiles(t.TempDir())
	h.Register(f.mux)
	for _, name := range []string{"owner", "co", "other"} {
		var id string
		if err := admin.QueryRow(context.Background(), `INSERT INTO accounts(email,password_hash,state,server_features,quota_mib)
 VALUES($1,'synthetic','active',true,1) RETURNING id::text`, name+"@example.test").Scan(&id); err != nil {
			t.Fatal(err)
		}
		raw := sessiontoken.New()
		f.tokens[id] = raw
		f.exec(`INSERT INTO sessions(account_id,token_digest) VALUES($1,$2)`, id, sessiontoken.Digest(raw))
		switch name {
		case "owner":
			f.owner = id
		case "co":
			f.co = id
		case "other":
			f.other = id
		}
	}
	if err := admin.QueryRow(context.Background(), `INSERT INTO organisations(name) VALUES('Studio') RETURNING id::text`).Scan(&f.org); err != nil {
		t.Fatal(err)
	}
	f.exec(`INSERT INTO organisation_members(organisation_id,account_id,role) VALUES($1,$2,'admin'),($1,$3,'member')`, f.org, f.owner, f.other)
	f.exec(`WITH p AS (INSERT INTO hosted_projects(id,host_id,organisation_id) VALUES($1,$2,$3) RETURNING id,host_id)
 INSERT INTO project_owners(project_id,account_id) SELECT id,host_id FROM p`, visibilityProject, f.owner, f.org)
	f.exec(`INSERT INTO project_owners(project_id,account_id) VALUES($1,$2)`, visibilityProject, f.co)
	return f
}

func (f *visibilityFixture) exec(query string, args ...any) {
	f.t.Helper()
	if _, err := f.admin.Exec(context.Background(), query, args...); err != nil {
		f.t.Fatal(err)
	}
}

func (f *visibilityFixture) request(method, path, account string, body any) *http.Request {
	f.t.Helper()
	data, err := json.Marshal(body)
	if err != nil {
		f.t.Fatal(err)
	}
	r := httptest.NewRequest(method, path, bytes.NewReader(data))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", visibilityOrigin)
	r.Header.Set("X-CSRF-Token", sessiontoken.CSRF(f.tokens[account]))
	if account != "" {
		r.AddCookie(&http.Cookie{Name: f.auth.CookieName(), Value: f.tokens[account]})
	}
	return r
}

func (f *visibilityFixture) serve(r *http.Request, status int, out any) *httptest.ResponseRecorder {
	f.t.Helper()
	w := httptest.NewRecorder()
	f.mux.ServeHTTP(w, r)
	if w.Code != status {
		f.t.Fatalf("%s %s: got %d, want %d: %s", r.Method, r.URL, w.Code, status, w.Body)
	}
	if out != nil {
		if err := json.Unmarshal(w.Body.Bytes(), out); err != nil {
			f.t.Fatal(err)
		}
	}
	return w
}

func (f *visibilityFixture) call(method, account string, body any, status int, out any) *httptest.ResponseRecorder {
	f.t.Helper()
	return f.serve(f.request(method, visibilityPath, account, body), status, out)
}

func TestPostgresProjectVisibility(t *testing.T) {
	f := newVisibilityFixture(t)
	var got projectVisibility
	for _, account := range []string{f.owner, f.co} {
		f.call("GET", account, nil, 200, &got)
		if got != (projectVisibility{Visibility: "private", Version: 1}) {
			t.Fatalf("default visibility: %+v", got)
		}
	}
	write := projectVisibility{Visibility: "listed", Version: 1, Name: "Published chapel"}
	f.call("GET", "", nil, 401, nil)
	f.call("GET", f.other, nil, 404, nil)
	f.call("PATCH", f.other, write, 404, nil)
	// A platform administrator who is not an owner has no special access.
	f.exec(`UPDATE accounts SET role='superuser' WHERE id=$1`, f.other)
	f.call("GET", f.other, nil, 404, nil)
	f.call("PATCH", f.other, write, 404, nil)
	for _, header := range []string{"Origin", "X-CSRF-Token"} {
		r := f.request("PATCH", visibilityPath, f.owner, write)
		r.Header.Del(header)
		f.serve(r, 403, nil)
	}
	// Co-owners may publish even when they are not members of this organisation.
	f.call("PATCH", f.co, write, 200, &got)
	if got != (projectVisibility{Visibility: "listed", Version: 2, Name: write.Name}) {
		t.Fatalf("publish: %+v", got)
	}
	write.Name = "Stale replacement"
	var failure map[string]string
	f.call("PATCH", f.owner, write, 409, &failure)
	if failure["error"] != "visibility_conflict" {
		t.Fatalf("wrong conflict: %+v", failure)
	}
	f.call("GET", f.owner, nil, 200, &got)
	if got.Version != 2 || got.Name != "Published chapel" || got.Visibility != "listed" {
		t.Fatalf("stale write changed metadata: %+v", got)
	}
	write.Version, write.Name = 2, "Renamed chapel"
	f.call("PATCH", f.owner, write, 200, &got)
	if got.Version != 3 || got.Name != write.Name {
		t.Fatalf("name-only update: %+v", got)
	}
	write.Version, write.Visibility = 3, "private"
	f.call("PATCH", f.co, write, 200, &got)
	if got.Visibility != "private" || got.Version != 4 || got.Name != write.Name {
		t.Fatalf("unpublish: %+v", got)
	}
	f.serve(f.request("POST", "/api/v1/hosted-projects/"+visibilityProject+"/owners/"+f.co+"/remove", f.owner, struct{}{}), 204, nil)
	f.call("GET", f.co, nil, 404, nil)
	write.Version = 4
	f.call("PATCH", f.co, write, 404, nil)
	// Removing hosting responsibility alone does not remove project ownership.
	f.exec(`UPDATE hosted_projects SET host_id=NULL WHERE id=$1`, visibilityProject)
	f.call("GET", f.owner, nil, 200, nil)
	f.call("PATCH", f.owner, write, 200, nil)
	f.exec(`INSERT INTO project_deletions(id,deleted_at,recover_until) VALUES($1,now(),now()+interval '1 day')`, visibilityProject)
	f.call("GET", f.owner, nil, 404, nil)
	write.Version = 5
	f.call("PATCH", f.owner, write, 404, nil)
	f.serve(f.request("GET", strings.Replace(visibilityPath, visibilityProject, "c0ffee00-0000-4000-8000-000000000099", 1), f.owner, nil), 404, nil)
}

func TestPostgresProjectVisibilityValidation(t *testing.T) {
	f := newVisibilityFixture(t)
	for _, body := range []any{
		map[string]any{},
		map[string]any{"visibility": "listed", "version": 1},
		map[string]any{"visibility": "listed", "version": 1, "name": nil},
		map[string]any{"visibility": "listed", "version": 1, "name": "Chapel", "extra": true},
		projectVisibility{"public", 1, "Chapel"},
		projectVisibility{"listed", 0, "Chapel"},
		projectVisibility{"listed", -1, "Chapel"},
		projectVisibility{"listed", 2147483647, "Chapel"},
		projectVisibility{"listed", 1, ""},
		projectVisibility{"private", 1, ""},
		projectVisibility{"listed", 1, " Chapel "},
		projectVisibility{"listed", 1, "\t\n"},
		projectVisibility{"listed", 1, "Bad\x00name"},
		projectVisibility{"listed", 1, strings.Repeat("é", 121)},
	} {
		f.call("PATCH", f.owner, body, 400, nil)
	}
	var got projectVisibility
	f.call("GET", f.owner, nil, 200, &got)
	if got.Version != 1 || got.Visibility != "private" || got.Name != "" {
		t.Fatalf("invalid writes changed default: %+v", got)
	}
	f.call("PATCH", f.owner, projectVisibility{"listed", 1, strings.Repeat("é", 120)}, 200, &got)
	if got.Version != 2 || len([]rune(got.Name)) != 120 {
		t.Fatalf("unicode boundary: %+v", got)
	}
	// Metadata routes are available without an object store, too.
	ids, err := identity.New(f.app)
	if err != nil {
		t.Fatal(err)
	}
	f.mux = http.NewServeMux()
	NewHTTP(f.auth, New(f.app, ids)).Register(f.mux)
	f.call("GET", f.owner, nil, 200, nil)
}

func TestPostgresProjectVisibilityConcurrentWriters(t *testing.T) {
	f := newVisibilityFixture(t)
	responses := make(chan *httptest.ResponseRecorder, 2)
	for _, account := range []string{f.owner, f.co} {
		r := f.request("PATCH", visibilityPath, account, projectVisibility{"listed", 1, account})
		go func() {
			w := httptest.NewRecorder()
			f.mux.ServeHTTP(w, r)
			responses <- w
		}()
	}
	counts := map[int]int{}
	for range 2 {
		w := <-responses
		counts[w.Code]++
		if w.Code != 200 && w.Code != 409 {
			t.Fatalf("concurrent update: %d %s", w.Code, w.Body)
		}
	}
	if counts[200] != 1 || counts[409] != 1 {
		t.Fatalf("expected one winner: %+v", counts)
	}
	var got projectVisibility
	f.call("GET", f.owner, nil, 200, &got)
	if got.Version != 2 {
		t.Fatalf("concurrent version: %+v", got)
	}
}
