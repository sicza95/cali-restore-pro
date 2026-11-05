package identity

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAdminHTTP(t *testing.T) {
	root, app := identityDB(t)
	ctx := context.Background()
	service, err := New(app)
	if err != nil {
		t.Fatal(err)
	}
	type user struct{ id, raw string }
	makeUser := func(email, role string, permissions int) user {
		t.Helper()
		u := user{raw: token()}
		err := root.QueryRow(ctx, `INSERT INTO accounts(email,password_hash,role,state,admin_permissions)
    VALUES ($1,'unused',$2,'active',$3) RETURNING id`, email, role, permissions).Scan(&u.id)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = root.Exec(ctx, `INSERT INTO sessions(account_id,token_digest) VALUES ($1,$2)`, u.id, digest(u.raw)); err != nil {
			t.Fatal(err)
		}
		return u
	}
	member := makeUser("member@example.test", "member", 0)
	delegated := makeUser("delegate@example.test", "administrator", 2)
	operator := makeUser("operator@example.test", "superuser", 0)
	const origin = "https://restoration.example.test"
	mux := http.NewServeMux()
	h := NewHTTP(service, origin, true)
	h.Register(mux)
	call := func(method, path string, u user, body string, want int) string {
		t.Helper()
		req := httptest.NewRequest(method, origin+"/api/v1/"+path, strings.NewReader(body))
		req.AddCookie(&http.Cookie{Name: h.cookieName, Value: u.raw})
		req.Header.Set("Origin", origin)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-CSRF-Token", CSRF(u.raw))
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		if w.Code != want {
			t.Fatalf("%s %s: %d: %s", method, path, w.Code, w.Body.String())
		}
		return w.Body.String()
	}
	path := func(u user, action string) string { return "admin/accounts/" + u.id + "/" + action }
	const confirmed = `{"confirm":true}`
	const grant = `{"confirm":true,"entitlement":{"serverFeatures":true,"quotaMiB":128}}`
	call("GET", "admin/accounts", member, "", 403)
	call("GET", "admin/operations", delegated, "", 403)
	call("POST", path(member, "sessions/revoke"), member, confirmed, 403)
	call("POST", path(member, "sessions/revoke"), delegated, confirmed, 403)
	call("POST", path(operator, "controls"), delegated, grant, 403)
	call("POST", path(delegated, "controls"), delegated, `{"confirm":true,"permissions":7}`, 403)
	call("POST", path(member, "controls"), operator, `{"confirm":true,"entitlement":{"quotaMiB":128}}`, 400)
	call("POST", path(member, "controls"), delegated, grant, 200)
	listing := call("GET", "admin/accounts?q=member", delegated, "", 200)
	if !strings.Contains(listing, `"serverFeatures":true,"quotaMiB":128`) || strings.Contains(listing, "password") {
		t.Fatal(listing)
	}
	literal := call("GET", "admin/accounts?q=%25", delegated, "", 200)
	if !strings.Contains(literal, `"accounts":[]`) {
		t.Fatal(literal)
	}
	for i := range 21 {
		makeUser(fmt.Sprintf("page%02d@example.test", i), "member", 0)
	}
	accounts, err := service.AdminAccounts(ctx, delegated.raw, "page", "")
	if err != nil || len(accounts) != 21 {
		t.Fatalf("first page: %d %v", len(accounts), err)
	}
	rest, err := service.AdminAccounts(ctx, delegated.raw, "page", accounts[19].ID)
	if err != nil || len(rest) != 1 || rest[0].ID != accounts[20].ID {
		t.Fatalf("second page: %v %v", rest, err)
	}
	call("POST", path(delegated, "controls"), operator, `{"confirm":true,"permissions":4}`, 200)
	call("GET", "auth/me", delegated, "", 401)
	if _, err := root.Exec(ctx, `INSERT INTO mail_outbox(payload,status,attempts,expires_at) VALUES ('secret payload','pending',2,now()+interval '1 hour')`); err != nil {
		t.Fatal(err)
	}
	ops := call("GET", "admin/operations", operator, "", 200)
	if !strings.Contains(ops, `"attempts":2`) || strings.Contains(ops, "payload") {
		t.Fatal(ops)
	}
	if !strings.Contains(ops, "delegation_changed") || strings.Contains(ops, "@") {
		t.Fatal(ops)
	}
	result := call("GET", "account/deletion-preflight", member, "", 200)
	if !strings.Contains(result, `"eligible":false`) {
		t.Fatal(result)
	}
	call("GET", path(member, "deletion-preflight"), member, "", 403)
	call("GET", path(member, "deletion-preflight"), operator, "", 200)
}
