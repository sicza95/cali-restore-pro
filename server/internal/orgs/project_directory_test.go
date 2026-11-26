package orgs

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/sicza95/cali-restore-pro/server/internal/identity"
	"github.com/sicza95/cali-restore-pro/server/internal/identity/sessiontoken"
	"github.com/sicza95/cali-restore-pro/server/internal/testdb"
)

func TestPostgresOrganisationProjectDirectory(t *testing.T) {
	admin, app := testdb.New(t)
	ctx := context.Background()
	ids, err := identity.New(app)
	if err != nil {
		t.Fatal(err)
	}
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := admin.Exec(ctx, query, args...); err != nil {
			t.Fatal(err)
		}
	}
	account := func(n int, name, role string) (id, raw string) {
		t.Helper()
		id = fmt.Sprintf("a0000000-0000-4000-8000-%012d", n)
		exec(`INSERT INTO accounts(id,email,password_hash,state,full_name,role) VALUES($1,$2,'synthetic','active',$3,$4)`, id, fmt.Sprintf("directory-%d@example.test", n), name, role)
		raw = sessiontoken.New()
		exec(`INSERT INTO sessions(account_id,token_digest) VALUES($1,$2)`, id, sessiontoken.Digest(raw))
		return
	}
	owner, ownerToken := account(1, "Anna", "member")
	co, _ := account(2, "", "member") // Legacy empty profile name is published as empty.
	member, memberToken := account(3, "Member", "member")
	_, outsiderToken := account(4, "Platform admin", "superuser")
	var org, otherOrg string
	if err := admin.QueryRow(ctx, `INSERT INTO organisations(name) VALUES('Studio') RETURNING id::text`).Scan(&org); err != nil {
		t.Fatal(err)
	}
	if err := admin.QueryRow(ctx, `INSERT INTO organisations(name) VALUES('Other studio') RETURNING id::text`).Scan(&otherOrg); err != nil {
		t.Fatal(err)
	}
	exec(`INSERT INTO organisation_members(organisation_id,account_id,role) VALUES($1,$2,'admin'),($1,$3,'member'),($4,$2,'admin')`, org, owner, member, otherOrg)
	project := func(n int, organisation, visibility string) string {
		t.Helper()
		id := fmt.Sprintf("b0000000-0000-4000-8000-%012d", n)
		exec(`WITH p AS (INSERT INTO hosted_projects(id,host_id,organisation_id,visibility,directory_name) VALUES($1,$2,$3,$4,$5) RETURNING id,host_id)
 INSERT INTO project_owners(project_id,account_id) SELECT id,host_id FROM p`, id, owner, organisation, visibility, fmt.Sprintf("Project %03d", n))
		return id
	}
	first := project(1, org, "listed")
	private := project(2, org, "private")
	deleted := project(3, org, "listed")
	foreign := project(4, otherOrg, "listed")
	last := project(5, org, "listed")
	exec(`INSERT INTO project_owners(project_id,account_id) VALUES($1,$2)`, first, co)
	exec(`INSERT INTO project_deletions(id,deleted_at,recover_until) VALUES($1,now(),now()+interval '1 day')`, deleted)
	const origin = "https://test.example"
	auth := identity.NewHTTP(ids, origin, false)
	mux := http.NewServeMux()
	NewHTTP(auth, New(app, ids)).Register(mux)
	call := func(organisation, query, token string, status int, out any) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest("GET", "/api/v1/organisations/"+organisation+"/projects"+query, nil)
		if token != "" {
			r.AddCookie(&http.Cookie{Name: auth.CookieName(), Value: token})
		}
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		if w.Code != status {
			t.Fatalf("%s: got %d, want %d: %s", r.URL, w.Code, status, w.Body)
		}
		if out != nil {
			if err := json.Unmarshal(w.Body.Bytes(), out); err != nil {
				t.Fatal(err)
			}
		}
		return w
	}
	var page projectDirectory
	w := call(org, "", memberToken, 200, &page)
	want := projectDirectory{Projects: []directoryProject{
		{ID: first, Name: "Project 001", Owners: []directoryOwner{{ID: owner, Name: "Anna"}, {ID: co, Name: ""}}},
		{ID: last, Name: "Project 005", Owners: []directoryOwner{{ID: owner, Name: "Anna"}}},
	}}
	if !reflect.DeepEqual(page, want) {
		t.Fatalf("directory leaked or omitted metadata: %+v", page)
	}
	// Compare raw JSON too: decoding into structs alone would ignore extra fields.
	wantJSON, _ := json.Marshal(want)
	var raw, expected any
	_ = json.Unmarshal(w.Body.Bytes(), &raw)
	_ = json.Unmarshal(wantJSON, &expected)
	if !reflect.DeepEqual(raw, expected) {
		t.Fatalf("card response must contain only contracted fields: %s", w.Body)
	}
	call(org, "", ownerToken, 200, &page)
	if !reflect.DeepEqual(page, want) {
		t.Fatalf("admin sees private/deleted projects: %+v", page)
	}
	call(otherOrg, "", ownerToken, 200, &page)
	if len(page.Projects) != 1 || page.Projects[0].ID != foreign {
		t.Fatalf("cross-organisation isolation: %+v", page)
	}
	for _, token := range []string{memberToken, outsiderToken} {
		var failure map[string]string
		call(otherOrg, "", token, 404, &failure)
		if failure["error"] != "not_found" {
			t.Fatalf("non-member response: %+v", failure)
		}
	}
	call(org, "", "", 401, nil)
	call("not-an-org", "", memberToken, 400, nil)
	call("b0000000-0000-4000-8000-999999999999", "", memberToken, 404, nil)

	call(org, "?limit=1", memberToken, 200, &page)
	if len(page.Projects) != 1 || page.Projects[0].ID != first || page.Next == nil || *page.Next != first {
		t.Fatalf("first page: %+v", page)
	}
	call(org, "?limit=1&after="+*page.Next, memberToken, 200, &page)
	if len(page.Projects) != 1 || page.Projects[0].ID != last || page.Next != nil {
		t.Fatalf("last page: %+v", page)
	}
	call(org, "?after="+last, memberToken, 200, &page)
	if page.Next != nil || page.Projects == nil || len(page.Projects) != 0 {
		t.Fatalf("empty page: %+v", page)
	}
	// Cursors need not name a listed project, and cannot expose another org.
	for _, cursor := range []string{private, foreign} {
		call(org, "?after="+cursor, memberToken, 200, &page)
		if len(page.Projects) != 1 || page.Projects[0].ID != last {
			t.Fatalf("exclusive cursor: %+v", page)
		}
	}
	for _, query := range []string{"?limit=0", "?limit=-1", "?limit=101", "?limit=NaN", "?limit=", "?limit=1&limit=2", "?after=bad", "?after=", "?after=" + first + "&after=" + last} {
		call(org, query, memberToken, 400, nil)
	}
	// Owner names and the owner set come from current rows on every page.
	exec(`UPDATE accounts SET full_name='Anna renamed' WHERE id=$1`, owner)
	exec(`DELETE FROM project_owners WHERE project_id=$1 AND account_id=$2`, first, co)
	call(org, "?limit=1", memberToken, 200, &page)
	if len(page.Projects[0].Owners) != 1 || page.Projects[0].Owners[0].Name != "Anna renamed" {
		t.Fatalf("stale owners: %+v", page)
	}
	// Membership is checked again on the next page, including for platform admins.
	exec(`DELETE FROM organisation_members WHERE organisation_id=$1 AND account_id=$2`, org, member)
	call(org, "?after="+first, memberToken, 404, nil)
	call(org, "", outsiderToken, 404, nil)

	// Defaults and the hard maximum are bounded with a lookahead for next.
	for i := 6; i <= 110; i++ {
		project(i, org, "listed")
	}
	call(org, "", ownerToken, 200, &page)
	if len(page.Projects) != 50 || page.Next == nil || *page.Next != page.Projects[49].ID {
		t.Fatalf("default page limit: %d %+v", len(page.Projects), page.Next)
	}
	call(org, "?limit=100", ownerToken, 200, &page)
	if len(page.Projects) != 100 || page.Next == nil || *page.Next != page.Projects[99].ID {
		t.Fatalf("maximum page limit: %d %+v", len(page.Projects), page.Next)
	}
	call(org, "?limit=100&after="+*page.Next, ownerToken, 200, &page)
	if len(page.Projects) != 7 || page.Next != nil {
		t.Fatalf("remaining page: %d %+v", len(page.Projects), page.Next)
	}
}
