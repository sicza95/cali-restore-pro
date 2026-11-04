package identity

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sicza95/cali-restore-pro/server/migrations"
)

const testPassword = "synthetic identity test password"

// Each package gets an independent disposable database; migration-history
// tampering in the migrations suite cannot race identity tests.
func identityDB(t *testing.T) (*pgxpool.Pool, *pgxpool.Pool) {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	root, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(root.Close)
	if _, err := root.Exec(ctx, `SELECT pg_advisory_xact_lock(72401600); DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='calirestore_app') THEN CREATE ROLE calirestore_app; END IF; END $$`); err != nil {
		t.Fatal(err)
	}
	dbName := fmt.Sprintf("identity_test_%d", time.Now().UnixNano())
	if _, err := root.Exec(ctx, "CREATE DATABASE "+dbName); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = root.Exec(ctx, "DROP DATABASE "+dbName+" WITH (FORCE)") })
	c, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	c.ConnConfig.Database = dbName
	admin, err := pgxpool.NewWithConfig(ctx, c)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(admin.Close)
	if err := migrations.Apply(ctx, admin); err != nil {
		t.Fatal(err)
	}
	appConfig := c.Copy()
	appConfig.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		_, err := conn.Exec(ctx, "SET ROLE calirestore_app")
		return err
	}
	app, err := pgxpool.NewWithConfig(ctx, appConfig)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Close)
	return admin, app
}

func TestPostgresIdentity(t *testing.T) {
	admin, app := identityDB(t)
	ctx := context.Background()
	s, err := New(app)
	if err != nil {
		t.Fatal(err)
	}
	mustExec := func(sql string, args ...any) {
		t.Helper()
		if _, err := admin.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	mustLogin := func(email string) string {
		t.Helper()
		raw, err := s.Login(ctx, email, testPassword, "")
		if err != nil {
			t.Fatal(err)
		}
		return raw
	}
	var bootstrapEmail string
	t.Run("concurrent one-time bootstrap and restricted app role", func(t *testing.T) {
		var successes atomic.Int32
		var wg sync.WaitGroup
		for _, email := range []string{"operator-a@example.test", "operator-b@example.test"} {
			wg.Go(func() {
				err := Bootstrap(ctx, admin, email, testPassword)
				if err == nil {
					successes.Add(1)
				} else if !errors.Is(err, ErrConflict) {
					t.Error(err)
				}
			})
		}
		wg.Wait()
		if successes.Load() != 1 {
			t.Fatal("bootstrap did not have one winner")
		}
		var originalHash string
		if err := admin.QueryRow(ctx, `SELECT email,password_hash FROM accounts`).Scan(&bootstrapEmail, &originalHash); err != nil {
			t.Fatal(err)
		}
		if err := Bootstrap(ctx, admin, bootstrapEmail, "a different valid bootstrap password"); err != nil {
			t.Fatal(err)
		}
		var unchanged string
		if err := admin.QueryRow(ctx, `SELECT password_hash FROM accounts`).Scan(&unchanged); err != nil || unchanged != originalHash {
			t.Fatal("bootstrap rerun reset credentials")
		}
		for _, sql := range []string{`UPDATE identity_guard SET bootstrap_account=NULL`, `DELETE FROM identity_guard`, `UPDATE accounts SET password_hash='bad'`, `DELETE FROM identity_audit`, `CREATE TABLE forbidden(id int)`} {
			if _, err := app.Exec(ctx, sql); err == nil {
				t.Fatal("app privilege escape", sql)
			}
		}
		if err := Bootstrap(ctx, app, bootstrapEmail, testPassword); err == nil {
			t.Fatal("app can bootstrap")
		}
	})
	hash, err := HashPassword(testPassword)
	if err != nil {
		t.Fatal(err)
	}
	ids := map[string]string{}
	for _, a := range []struct{ name, role, state string }{{"member", "member", "active"}, {"other", "member", "active"}, {"admin", "administrator", "active"}, {"second", "superuser", "active"}, {"pending", "member", "pending_verification"}, {"suspended", "member", "suspended"}} {
		var id string
		if err := admin.QueryRow(ctx, `INSERT INTO accounts(email,password_hash,role,state) VALUES ($1,$2,$3,$4) RETURNING id`, a.name+"@example.test", hash, a.role, a.state).Scan(&id); err != nil {
			t.Fatal(err)
		}
		ids[a.name] = id
	}
	t.Run("neutral credentials and persistent opaque revocable sessions", func(t *testing.T) {
		for _, email := range []string{"missing@example.test", "pending@example.test", "suspended@example.test"} {
			if _, err := s.Login(ctx, email, testPassword, ""); !errors.Is(err, ErrCredentials) {
				t.Fatal(email, err)
			}
		}
		if _, err := s.Login(ctx, "member@example.test", "wrong password with sufficient length", ""); !errors.Is(err, ErrCredentials) {
			t.Fatal(err)
		}
		raw := mustLogin("member@example.test")
		current, err := s.Current(ctx, raw)
		if err != nil || current.Account.ID != ids["member"] {
			t.Fatal(current, err)
		}
		var stored []byte
		if err := admin.QueryRow(ctx, `SELECT token_digest FROM sessions WHERE id=$1`, current.ID).Scan(&stored); err != nil || string(stored) == raw || len(stored) != 32 {
			t.Fatal("raw token persisted", err)
		}
		// Routine age does not sign out; sensitive operations still require a
		// five-minute confirmation, renewed by rotating the session identifier.
		mustExec(`UPDATE sessions SET created_at=now()-interval '1 year',verified_at=now()-interval '1 hour' WHERE id=$1`, current.ID)
		if _, err := s.Current(ctx, raw); err != nil {
			t.Fatal("idle/absolute logout introduced", err)
		}
		if err := s.Revoke(ctx, raw, ids["member"], ""); !errors.Is(err, ErrRecent) {
			t.Fatal(err)
		}
		rotated, err := s.Login(ctx, "member@example.test", testPassword, raw)
		if err != nil || rotated == raw {
			t.Fatal("confirmation failed to rotate", err)
		}
		if _, err := s.Current(ctx, raw); !errors.Is(err, ErrUnauthorized) {
			t.Fatal("old token survived confirmation")
		}
		if err := s.Logout(ctx, rotated); err != nil {
			t.Fatal(err)
		}
		if _, err := s.Current(ctx, rotated); !errors.Is(err, ErrUnauthorized) {
			t.Fatal("logout not authoritative")
		}
	})
	t.Run("ownership admin bypasses suspension and policy revocation", func(t *testing.T) {
		member := mustLogin("member@example.test")
		other := mustLogin("other@example.test")
		otherSession, _ := s.Current(ctx, other)
		if err := s.Revoke(ctx, member, ids["member"], otherSession.ID); err != nil {
			t.Fatal(err)
		}
		if _, err := s.Current(ctx, other); err != nil {
			t.Fatal("cross-account session ID revoked")
		}
		if err := s.Revoke(ctx, member, ids["other"], ""); !errors.Is(err, ErrForbidden) {
			t.Fatal(err)
		}
		if err := s.SetPolicy(ctx, member, ids["member"], "superuser", "active"); !errors.Is(err, ErrForbidden) {
			t.Fatal("member self-promotion", err)
		}
		delegated := mustLogin("admin@example.test")
		if err := s.SetPolicy(ctx, delegated, ids["other"], "administrator", "active"); !errors.Is(err, ErrForbidden) {
			t.Fatal("admin promoted a role", err)
		}
		if err := s.SetPolicy(ctx, delegated, ids["second"], "superuser", "suspended"); !errors.Is(err, ErrForbidden) {
			t.Fatal("admin suspended superuser", err)
		}
		if err := s.SetPolicy(ctx, delegated, ids["other"], "member", "suspended"); err != nil {
			t.Fatal(err)
		}
		if _, err := s.Current(ctx, other); !errors.Is(err, ErrUnauthorized) {
			t.Fatal("suspended token survived")
		}
		if err := s.SetPolicy(ctx, delegated, ids["other"], "member", "active"); err != nil {
			t.Fatal(err)
		}
		if _, err := s.Current(ctx, other); !errors.Is(err, ErrUnauthorized) {
			t.Fatal("reactivation resurrected session")
		}
		operator := mustLogin(bootstrapEmail)
		if err := s.SetPolicy(ctx, operator, ids["pending"], "member", "active"); !errors.Is(err, ErrConflict) {
			t.Fatal("verification bypass", err)
		}
		if err := s.SetPolicy(ctx, operator, ids["admin"], "member", "active"); err != nil {
			t.Fatal(err)
		}
		if err := s.Revoke(ctx, delegated, ids["member"], ""); !errors.Is(err, ErrUnauthorized) {
			t.Fatal("demoted session retained privilege", err)
		}
	})
	t.Run("last superuser protected through API and concurrent direct SQL", func(t *testing.T) {
		operator := mustLogin(bootstrapEmail)
		current, _ := s.Current(ctx, operator)
		var successes atomic.Int32
		var wg sync.WaitGroup
		for _, id := range []string{current.Account.ID, ids["second"]} {
			wg.Go(func() {
				_, err := admin.Exec(ctx, `UPDATE accounts SET state='suspended' WHERE id=$1`, id)
				if err == nil {
					successes.Add(1)
				} else if pgErrCode(err) != "23514" {
					t.Error(err)
				}
			})
		}
		wg.Wait()
		if successes.Load() != 1 {
			t.Fatal("final-superuser race allowed wrong number of changes", successes.Load())
		}
		var remainingID, remainingEmail string
		if err := admin.QueryRow(ctx, `SELECT id,email FROM accounts WHERE state='active' AND role='superuser'`).Scan(&remainingID, &remainingEmail); err != nil {
			t.Fatal(err)
		}
		remaining := mustLogin(remainingEmail)
		if err := s.SetPolicy(ctx, remaining, remainingID, "member", "active"); !errors.Is(err, ErrConflict) {
			t.Fatal("last-superuser demotion", err)
		}
		if err := s.SetPolicy(ctx, remaining, remainingID, "superuser", "suspended"); !errors.Is(err, ErrConflict) {
			t.Fatal("last-superuser suspension", err)
		}
		if _, err := admin.Exec(ctx, `DELETE FROM accounts WHERE id=$1`, remainingID); err == nil {
			t.Fatal("last-superuser deletion")
		}
		// Restore both fixture operators for remaining tests.
		mustExec(`UPDATE accounts SET state='active' WHERE role='superuser'`)
	})
	t.Run("strict HTTP origin CSRF JSON and secure cookies", func(t *testing.T) {
		h := NewHTTP(s, "https://restore.example.test", true)
		mux := http.NewServeMux()
		h.Register(mux)
		request := func(method, path, body, raw, origin, csrf, content string) *httptest.ResponseRecorder {
			t.Helper()
			r := httptest.NewRequest(method, path, strings.NewReader(body))
			r.Header.Set("Origin", origin)
			r.Header.Set("Content-Type", content)
			r.Header.Set("X-CSRF-Token", csrf)
			if raw != "" {
				r.AddCookie(&http.Cookie{Name: h.cookieName, Value: raw})
			}
			w := httptest.NewRecorder()
			mux.ServeHTTP(w, r)
			return w
		}
		for _, origin := range []string{"", "https://attacker.example.test", "null"} {
			if w := request("POST", "/api/v1/auth/login", `{}`, "", origin, "", "application/json"); w.Code != 403 {
				t.Fatal(w)
			}
		}
		body := `{"email":"member@example.test","password":"` + testPassword + `"}`
		login := request("POST", "/api/v1/auth/login", body, "", h.origin, "", "application/json")
		if login.Code != 200 {
			t.Fatal(login)
		}
		cookies := login.Result().Cookies()
		if len(cookies) != 1 || !cookies[0].Secure || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteStrictMode || cookies[0].Path != "/" || cookies[0].Domain != "" || cookies[0].MaxAge <= 0 {
			t.Fatal("unsafe cookie", cookies)
		}
		raw := cookies[0].Value
		if strings.Contains(login.Body.String(), raw) || login.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("token or cache disclosure")
		}
		for _, test := range []struct {
			path, body, csrf, content string
			code                      int
		}{
			{"logout", `{}`, "", "application/json", 403},
			{"logout", `{}`, CSRF(raw), "text/plain", 415},
			{"logout", `{} {}`, CSRF(raw), "application/json", 400},
			{"logout", `{"extra":true}`, CSRF(raw), "application/json", 400},
			{"logout", strings.Repeat(" ", 5000) + `{}`, CSRF(raw), "application/json", 400},
			{"sessions/revoke", `{"all":true}`, CSRF(raw), "application/json", 403},
		} {
			w := request("POST", "/api/v1/auth/"+test.path, test.body, raw, h.origin, test.csrf, test.content)
			if w.Code != test.code {
				t.Fatalf("%s: %d %s", test.path, w.Code, w.Body)
			}
		}
		if w := request("GET", "/api/v1/auth/me", "", raw, "", "", ""); w.Code != 200 || strings.Contains(w.Body.String(), "password") {
			t.Fatal(w)
		}
		memberID := ids["member"]
		if w := request("POST", "/api/v1/admin/accounts/"+memberID+"/policy", `{"role":"superuser","state":"active","confirm":true}`, raw, h.origin, CSRF(raw), "application/json"); w.Code != 403 {
			t.Fatal("direct HTTP self-promotion", w)
		}
		if w := request("POST", "/api/v1/auth/logout", `{}`, raw, h.origin, CSRF(raw), "application/json"); w.Code != 200 || w.Result().Cookies()[0].MaxAge != -1 {
			t.Fatal(w)
		}
		if w := request("GET", "/api/v1/auth/me", "", raw, "", "", ""); w.Code != 401 {
			t.Fatal("revoked HTTP session", w)
		}
	})
	t.Run("durable rate and bounded hashing limits", func(t *testing.T) {
		mustExec(`DELETE FROM auth_rate_limits`)
		for range 10 {
			if err := s.rate(ctx, "limited@example.test"); err != nil {
				t.Fatal(err)
			}
		}
		restarted, err := New(app)
		if err != nil {
			t.Fatal(err)
		}
		if err := restarted.rate(ctx, "limited@example.test"); !errors.Is(err, ErrLimited) {
			t.Fatal("restart bypassed rate", err)
		}
		mustExec(`DELETE FROM auth_rate_limits`)
		s.slots <- struct{}{}
		s.slots <- struct{}{}
		if _, err := s.Login(ctx, "member@example.test", testPassword, ""); !errors.Is(err, ErrLimited) {
			t.Fatal("hash concurrency unbounded", err)
		}
		<-s.slots
		<-s.slots
		mustExec(`DELETE FROM auth_rate_limits`)
		var successes atomic.Int32
		var wg sync.WaitGroup
		for range 20 {
			wg.Go(func() {
				if err := s.rate(ctx, "race@example.test"); err == nil {
					successes.Add(1)
				} else if !errors.Is(err, ErrLimited) {
					t.Error(err)
				}
			})
		}
		wg.Wait()
		if successes.Load() != 10 {
			t.Fatal("concurrent rate bypass", successes.Load())
		}
	})
	t.Run("session cap and global budget", func(t *testing.T) {
		mustExec(`DELETE FROM auth_rate_limits`)
		mustExec(`DELETE FROM sessions WHERE account_id=$1`, ids["member"])
		for range maxSessions {
			mustExec(`INSERT INTO sessions(account_id,token_digest) VALUES ($1,$2)`, ids["member"], digest(token()))
		}
		if _, err := s.Login(ctx, "member@example.test", testPassword, ""); !errors.Is(err, ErrConflict) {
			t.Fatal("session cap bypass", err)
		}
		mustExec(`DELETE FROM auth_rate_limits`)
		for i := range 120 {
			if err := s.rate(ctx, fmt.Sprintf("global-%d@example.test", i)); err != nil {
				t.Fatal(err)
			}
		}
		if err := s.rate(ctx, "global-over@example.test"); !errors.Is(err, ErrLimited) {
			t.Fatal("global budget bypass", err)
		}
	})
}
