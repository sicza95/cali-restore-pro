package identity

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/sicza95/cali-restore-pro/server/internal/identity/sessiontoken"
	"github.com/sicza95/cali-restore-pro/server/internal/testdb"
)

func TestOperationsReadableMetadata(t *testing.T) {
	root, app := testdb.New(t)
	ctx := context.Background()
	s, err := New(app)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.ConfigureMail(make([]byte, 32), "https://restore.example.test"); err != nil {
		t.Fatal(err)
	}
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	type user struct{ id, token string }
	makeUser := func(email, role, state string, permissions int) user {
		t.Helper()
		u := user{token: sessiontoken.New()}
		must(root.QueryRow(ctx, `INSERT INTO accounts(email,password_hash,role,state,admin_permissions)
    VALUES($1,'unused',$2,$3,$4) RETURNING id`, email, role, state, permissions).Scan(&u.id))
		_, err := root.Exec(ctx, `INSERT INTO sessions(account_id,token_digest) VALUES($1,$2)`, u.id, sessiontoken.Digest(u.token))
		must(err)
		return u
	}
	operator := makeUser("operations@example.test", "administrator", "active", 4)
	member := makeUser("member@example.test", "member", "active", 0)
	delegate := makeUser("delegate@example.test", "administrator", "active", 2)
	suspended := makeUser("suspended@example.test", "administrator", "suspended", 4)
	deleted := makeUser("deleted@example.test", "member", "active", 0)
	for _, pair := range [][2]string{{operator.id, member.id}, {deleted.id, member.id}, {member.id, deleted.id}} {
		_, err = root.Exec(ctx, `INSERT INTO identity_audit(actor_id,subject_id,action) VALUES($1,$2,'sessions_revoked')`, pair[0], pair[1])
		must(err)
	}
	_, err = root.Exec(ctx, `DELETE FROM accounts WHERE id=$1`, deleted.id)
	must(err)
	// Enqueue records all supported kinds; terminal jobs retain the kind without
	// exposing or decrypting recipients, bearer tokens or the erased payload.
	tx, err := app.Begin(ctx)
	must(err)
	defer tx.Rollback(ctx)
	kinds := []string{"verify", "reset", "email", "security", "project-invitation"}
	for _, kind := range kinds {
		must(s.Enqueue(ctx, tx, member.id, "recipient@example.test", "hu", kind, "secret-token", time.Now().Add(time.Hour)))
	}
	must(tx.Commit(ctx))
	_, err = root.Exec(ctx, `UPDATE mail_outbox SET status='sent',payload=NULL WHERE kind IN ('verify','email');
    UPDATE mail_outbox SET status='failed',payload=NULL WHERE kind='security';
    INSERT INTO mail_outbox(status,expires_at) VALUES('sent',now()+interval '1 hour')`)
	must(err)
	const origin = "https://restore.example.test"
	mux := http.NewServeMux()
	h := NewHTTP(s, origin, true)
	h.Register(mux)
	call := func(token string, want int) string {
		t.Helper()
		r := httptest.NewRequest("GET", origin+"/api/v1/admin/operations", nil)
		r.AddCookie(&http.Cookie{Name: h.cookieName, Value: token})
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("operations: %d, want %d: %s", w.Code, want, w.Body.String())
		}
		return w.Body.String()
	}
	for _, denied := range []struct {
		token  string
		status int
	}{
		{"", 401}, {member.token, 403}, {delegate.token, 403}, {suspended.token, 401},
	} {
		body := call(denied.token, denied.status)
		if strings.Contains(body, "@") || strings.Contains(body, "actorId") || strings.Contains(body, "jobs") {
			t.Fatal("operations metadata leaked:", body)
		}
	}
	if operatorAccount, err := s.Current(ctx, operator.token); err != nil || operatorAccount.Account.Allows(ViewAccounts) {
		t.Fatal("fixture must have operations permission without account search", err)
	}
	body := call(operator.token, 200)
	for _, secret := range []string{"recipient@example.test", "deleted@example.test", "secret-token", "payload", "password"} {
		if strings.Contains(body, secret) {
			t.Fatalf("unexpected %s in %s", secret, body)
		}
	}
	var result AdminOperations
	must(json.Unmarshal([]byte(body), &result))
	if len(result.Audit) != 3 || len(result.Jobs) != 6 {
		t.Fatalf("lost operations rows: %+v", result)
	}
	for _, event := range result.Audit {
		if event.Actor == deleted.id {
			if event.ActorEmail != nil {
				t.Fatal("deleted actor email", event)
			}
		} else {
			want := "member@example.test"
			if event.Actor == operator.id {
				want = "operations@example.test"
			}
			if event.ActorEmail == nil || *event.ActorEmail != want {
				t.Fatal("actor email", event)
			}
		}
		if event.Subject == deleted.id {
			if event.SubjectEmail != nil {
				t.Fatal("deleted subject email", event)
			}
		} else if event.SubjectEmail == nil || *event.SubjectEmail != "member@example.test" {
			t.Fatal("subject email", event)
		}
	}
	seen := map[string]bool{}
	for _, job := range result.Jobs {
		seen[job.Kind] = true
	}
	for _, kind := range append(kinds, "") {
		if !seen[kind] {
			t.Fatal("missing kind", kind)
		}
	}
	_, err = root.Exec(ctx, `DELETE FROM sessions WHERE account_id=$1`, operator.id)
	must(err)
	call(operator.token, 401)
}
