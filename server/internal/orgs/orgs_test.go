package orgs

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/sicza95/cali-restore-pro/server/internal/identity"
	"github.com/sicza95/cali-restore-pro/server/internal/identity/sessiontoken"
	"github.com/sicza95/cali-restore-pro/server/internal/testdb"
)

func TestGroupNormalise(t *testing.T) {
	g, ok := Group{Name: "  Office  team ", Sections: map[string]string{"pricing": "read"}, Actions: []string{"project.export"}}.normalise()
	if !ok || g.Name != "Office team" || g.Sections["core"] != "none" || g.Sections[summary] != "read" || len(g.Sections) != len(sections) {
		t.Fatalf("normalised %+v %v", g, ok)
	}
	for _, bad := range []Group{
		{Name: "", Sections: map[string]string{}},
		{Name: "x", Sections: map[string]string{"unknown": "read"}},
		{Name: "x", Sections: map[string]string{"core": "admin"}},
		{Name: "x", Sections: map[string]string{summary: "write"}},
		{Name: "x", Actions: []string{"everything"}},
		{Name: "x", Actions: []string{"project.export", "project.export"}},
	} {
		if _, ok := bad.normalise(); ok {
			t.Fatalf("accepted %+v", bad)
		}
	}
	for _, lang := range []string{"en", "hu"} {
		for _, g := range starterGroups(lang) {
			if _, ok := g.normalise(); !ok {
				t.Fatalf("starter group %s invalid", g.Name)
			}
		}
	}
}

func TestPostgresOrganisations(t *testing.T) {
	admin, app := testdb.New(t)
	ctx := context.Background()
	ids, err := identity.New(app)
	if err != nil {
		t.Fatal(err)
	}
	const origin = "https://test.example"
	if err := ids.ConfigureMail(make([]byte, 32), origin); err != nil {
		t.Fatal(err)
	}
	auth := identity.NewHTTP(ids, origin, false)
	mux := http.NewServeMux()
	NewHTTP(auth, New(app, ids)).Register(mux)
	account := func(email string) (id, raw string) {
		t.Helper()
		if err := admin.QueryRow(ctx, `INSERT INTO accounts(email,password_hash,state) VALUES ($1,'synthetic','active') RETURNING id`, email).Scan(&id); err != nil {
			t.Fatal(err)
		}
		raw = sessiontoken.New()
		if _, err := admin.Exec(ctx, `INSERT INTO sessions(account_id,token_digest) VALUES ($1,$2)`, id, sessiontoken.Digest(raw)); err != nil {
			t.Fatal(err)
		}
		return
	}
	call := func(method, path, raw string, value any, status int, out any) {
		t.Helper()
		var body []byte
		if value != nil {
			body, _ = json.Marshal(value)
		}
		r := httptest.NewRequest(method, "/api/v1"+path, bytes.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Origin", origin)
		r.Header.Set("X-CSRF-Token", sessiontoken.CSRF(raw))
		r.AddCookie(&http.Cookie{Name: auth.CookieName(), Value: raw})
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		if w.Code != status {
			t.Fatalf("%s %s: got %d, want %d: %s", method, path, w.Code, status, w.Body)
		}
		if out != nil {
			if err := json.Unmarshal(w.Body.Bytes(), out); err != nil {
				t.Fatal(err)
			}
		}
	}
	anna, annaToken := account("anna@example.test")
	bob, bobToken := account("bob@example.test")

	// Every account starts with its personal organisation.
	var overview Overview
	call("GET", "/organisations", annaToken, nil, 200, &overview)
	if len(overview.Organisations) != 1 || !overview.Organisations[0].Personal || overview.Organisations[0].Role != "admin" {
		t.Fatalf("personal organisation %+v", overview)
	}
	personal := overview.Organisations[0].ID
	call("POST", "/organisations/"+personal+"/invitations", annaToken, map[string]any{"email": "bob@example.test", "role": "member"}, 409, nil)
	call("DELETE", "/organisations/"+personal, annaToken, nil, 409, nil)

	var created struct{ ID string }
	call("POST", "/organisations", annaToken, map[string]string{"name": " Acme  Restoration ", "language": "en"}, 200, &created)
	org := "/organisations/" + created.ID
	var detail Detail
	call("GET", org, annaToken, nil, 200, &detail)
	if detail.Name != "Acme Restoration" || len(detail.Groups) != 6 || len(detail.Members) != 1 || detail.Members[0].ID != anna {
		t.Fatalf("new organisation %+v", detail)
	}
	estimator := detail.Groups[0].ID

	// Outsiders learn nothing about the organisation.
	call("GET", org, bobToken, nil, 404, nil)
	call("POST", org+"/invitations", bobToken, map[string]any{"email": "bob@example.test", "role": "admin"}, 404, nil)

	// An invitation to an address without an account looks the same as any other.
	call("POST", org+"/invitations", annaToken, map[string]any{"email": "nobody@example.test", "role": "member"}, 200, nil)
	call("POST", org+"/invitations", annaToken, map[string]any{"email": "Bob@Example.test", "role": "member", "groups": []string{estimator}}, 200, nil)
	call("POST", org+"/invitations", annaToken, map[string]any{"email": "anna@example.test", "role": "member"}, 409, nil)
	call("POST", org+"/invitations", annaToken, map[string]any{"email": "x@example.test", "role": "member", "groups": []string{personal}}, 400, nil)
	var mails int
	if err := admin.QueryRow(ctx, `SELECT count(*) FROM mail_outbox WHERE kind='organisation-invitation' AND account_id=$1`, bob).Scan(&mails); err != nil || mails != 1 {
		t.Fatalf("invitation mail %d %v", mails, err)
	}

	call("GET", "/organisations", bobToken, nil, 200, &overview)
	if len(overview.Invitations) != 1 || overview.Invitations[0].Name != "Acme Restoration" || overview.Invitations[0].InvitedBy != "anna@example.test" {
		t.Fatalf("bob's invitations %+v", overview.Invitations)
	}
	invitation := overview.Invitations[0].ID
	call("POST", "/organisation-invitations/"+invitation+"/accept", annaToken, struct{}{}, 404, nil)
	call("POST", "/organisation-invitations/"+invitation+"/accept", bobToken, struct{}{}, 200, nil)
	call("POST", "/organisation-invitations/"+invitation+"/accept", bobToken, struct{}{}, 404, nil)
	call("GET", org, bobToken, nil, 200, &detail)
	if detail.Role != "member" || len(detail.Members) != 2 || len(detail.Invitations) != 0 {
		t.Fatalf("bob's view %+v", detail)
	}
	for _, m := range detail.Members {
		if m.ID == bob && (len(m.Groups) != 1 || m.Groups[0] != estimator) {
			t.Fatalf("bob's groups %+v", m)
		}
	}

	// Members cannot manage; admins can, and one admin always remains.
	call("PATCH", org, bobToken, map[string]string{"name": "Bob's"}, 403, nil)
	call("PUT", org+"/members/"+anna, annaToken, map[string]any{"role": "member"}, 409, nil)
	call("DELETE", org+"/members/"+anna, annaToken, nil, 409, nil)
	call("PUT", org+"/members/"+bob, annaToken, map[string]any{"role": "admin", "groups": []string{}}, 200, nil)
	call("DELETE", org+"/members/"+anna, annaToken, nil, 200, nil)
	call("GET", org, annaToken, nil, 404, nil)

	// Groups: create, change and delete, with the shape checked.
	var group struct{ ID string }
	call("POST", org+"/groups", bobToken, map[string]any{"name": "Office", "sections": map[string]string{"core": "write", "pricing-summary": "write"}}, 400, nil)
	call("POST", org+"/groups", bobToken, map[string]any{"name": "Office", "sections": map[string]string{"core": "write"}, "actions": []string{"project.export"}, "allProjects": true}, 200, &group)
	call("PUT", org+"/groups/"+group.ID, bobToken, map[string]any{"name": "Office staff", "sections": map[string]string{"pricing": "read"}}, 200, nil)
	call("GET", org, bobToken, nil, 200, &detail)
	last := detail.Groups[len(detail.Groups)-1]
	if last.Name != "Office staff" || last.Sections["core"] != "none" || last.Sections[summary] != "read" || last.AllProjects {
		t.Fatalf("changed group %+v", last)
	}
	call("DELETE", org+"/groups/"+group.ID, bobToken, nil, 200, nil)
	call("DELETE", org+"/groups/"+group.ID, bobToken, nil, 404, nil)

	// An organisation with hosted projects cannot be deleted.
	if _, err := admin.Exec(ctx, `WITH p AS (INSERT INTO hosted_projects(id,host_id,organisation_id) VALUES(gen_random_uuid(),$1,$2) RETURNING id,host_id)
 INSERT INTO project_owners(project_id,account_id) SELECT id,host_id FROM p`, bob, created.ID); err != nil {
		t.Fatal(err)
	}
	call("DELETE", org, bobToken, nil, 409, nil)
	if _, err := admin.Exec(ctx, `DELETE FROM project_owners; DELETE FROM hosted_projects`); err != nil {
		t.Fatal(err)
	}
	call("DELETE", org, bobToken, nil, 200, nil)
	call("GET", org, bobToken, nil, 404, nil)

	// A project hosted without naming one lands in the host's personal organisation.
	var landed string
	if err := admin.QueryRow(ctx, `WITH p AS (INSERT INTO hosted_projects(id,host_id) VALUES(gen_random_uuid(),$1) RETURNING id,host_id,organisation_id),
 o AS (INSERT INTO project_owners(project_id,account_id) SELECT id,host_id FROM p)
 SELECT organisation_id::text FROM p`, anna).Scan(&landed); err != nil || landed != personal {
		t.Fatalf("default organisation %q %v", landed, err)
	}
}
