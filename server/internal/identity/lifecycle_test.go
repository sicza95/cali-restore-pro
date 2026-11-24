package identity

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/sicza95/cali-restore-pro/server/internal/mailer"
	"github.com/sicza95/cali-restore-pro/server/internal/testdb"
)

func TestPostgresLifecycle(t *testing.T) {
	admin, app := testdb.New(t)
	ctx := context.Background()
	s, err := New(app)
	if err != nil {
		t.Fatal(err)
	}
	key := make([]byte, 32)
	key[0] = 1
	if err = s.ConfigureMail(key, "https://restore.example"); err != nil {
		t.Fatal(err)
	}
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	query := func(sql string, args ...any) { t.Helper(); _, err := admin.Exec(ctx, sql, args...); must(err) }
	latest := func(purpose string) mailer.Payload {
		t.Helper()
		var sealed []byte
		must(admin.QueryRow(ctx, `SELECT payload FROM mail_outbox WHERE payload IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 1`).Scan(&sealed))
		n := s.mailCipher.NonceSize()
		plain, err := s.mailCipher.Open(nil, sealed[:n], sealed[n:], []byte("calirestore-mail-v1"))
		must(err)
		var p mailer.Payload
		must(json.Unmarshal(plain, &p))
		if p.Purpose != purpose {
			t.Fatalf("purpose %s", p.Purpose)
		}
		if strings.Contains(string(sealed), p.Token) && p.Token != "" {
			t.Fatal("plaintext token in outbox")
		}
		return p
	}
	must(s.RegisterAccount(ctx, "member@example.test", "hu"))
	verify := latest("verify")
	if !codeShape.MatchString(verify.Code) {
		t.Fatal("code shape", verify.Code)
	}
	if _, err = s.Login(ctx, verify.To, testdb.Password, ""); !errors.Is(err, ErrCredentials) {
		t.Fatal("unverified login", err)
	}
	// Registering again while pending sends a fresh link and code and ends the old pair.
	must(s.RegisterAccount(ctx, verify.To, "en"))
	again := latest("verify")
	if again.Token == verify.Token {
		t.Fatal("reused link")
	}
	if err = s.CheckCode(ctx, CodeProof{Token: verify.Token}); !errors.Is(err, ErrLink) {
		t.Fatal("old link still valid", err)
	}
	verify = again
	if err = s.ConsumeLink(ctx, verify.Token, "reset"); !errors.Is(err, ErrLink) {
		t.Fatal("purpose bypass", err)
	}
	// A link alone cannot activate an account that has no password yet.
	if err = s.ConsumeLink(ctx, verify.Token, "verify"); !errors.Is(err, ErrLink) {
		t.Fatal("link-only verify", err)
	}
	query(`DELETE FROM auth_rate_limits`)
	wrong := "000000"
	if verify.Code == wrong {
		wrong = "111111"
	}
	byCode := func(code string) CodeProof { return CodeProof{Email: verify.To, Code: code} }
	must(s.CheckCode(ctx, byCode(verify.Code)))
	for range codeAttempts - 1 {
		if err = s.CheckCode(ctx, byCode(wrong)); !errors.Is(err, ErrLink) {
			t.Fatal("wrong code accepted", err)
		}
	}
	must(s.CheckCode(ctx, byCode(verify.Code)))
	if err = s.CheckCode(ctx, byCode(wrong)); !errors.Is(err, ErrLink) {
		t.Fatal("wrong code accepted", err)
	}
	// The fifth wrong entry ends the code; the link from the same email still works.
	if err = s.CheckCode(ctx, byCode(verify.Code)); !errors.Is(err, ErrLink) {
		t.Fatal("code survived its attempts", err)
	}
	if _, err = s.CompleteCode(ctx, CodeProof{Token: verify.Token}, "short"); !errors.Is(err, ErrCredentials) {
		t.Fatal("weak password", err)
	}
	signedIn, err := s.CompleteCode(ctx, CodeProof{Token: verify.Token}, testdb.Password)
	must(err)
	if _, err = s.Current(ctx, signedIn); err != nil {
		t.Fatal("signup did not sign in", err)
	}
	if welcome := latest("welcome"); welcome.Token != "" || welcome.Code != "" || welcome.To != verify.To {
		t.Fatal("welcome mail", welcome)
	}
	if _, err = s.CompleteCode(ctx, CodeProof{Token: verify.Token}, testdb.Password); !errors.Is(err, ErrLink) {
		t.Fatal("replay", err)
	}
	// An active account gets a notice, never a new link, and its password stays.
	must(s.RegisterAccount(ctx, verify.To, "en"))
	if notice := latest("account-exists"); notice.Token != "" || notice.Code != "" {
		t.Fatal("notice carries a secret")
	}
	var kind string
	must(admin.QueryRow(ctx, `SELECT kind FROM mail_outbox ORDER BY created_at DESC,id DESC LIMIT 1`).Scan(&kind))
	if kind != "security" {
		t.Fatal("notice kind", kind)
	}
	// The code path also finishes an account, and an expired code does not.
	query(`DELETE FROM auth_rate_limits`)
	must(s.RegisterAccount(ctx, "code@example.test", "en"))
	byMail := latest("verify")
	if _, err = s.CompleteCode(ctx, CodeProof{Email: "CODE@example.test", Code: byMail.Code}, testdb.Password); err != nil {
		t.Fatal("code signup", err)
	}
	must(s.RegisterAccount(ctx, "late@example.test", "en"))
	late := latest("verify")
	query(`UPDATE identity_links SET expires_at=now()-interval '1 second' WHERE purpose='verify'`)
	if err = s.CheckCode(ctx, CodeProof{Email: late.To, Code: late.Code}); !errors.Is(err, ErrLink) {
		t.Fatal("expired code", err)
	}
	query(`DELETE FROM auth_rate_limits`)
	raw, err := s.Login(ctx, verify.To, testdb.Password, "")
	must(err)
	must(s.ForgotPassword(ctx, verify.To, "hu"))
	reset := latest("reset")
	query(`UPDATE identity_links SET expires_at=now()-interval '1 second'`)
	if _, err = s.CompleteCode(ctx, CodeProof{Token: reset.Token}, testdb.Password); !errors.Is(err, ErrLink) {
		t.Fatal("expired", err)
	}
	// A reset by code: checking does not use it up, a wrong code is refused, and
	// finishing signs in on a new session while ending the old ones.
	query(`DELETE FROM auth_rate_limits`)
	must(s.ForgotPassword(ctx, verify.To, "en"))
	reset = latest("reset")
	if reset.Token == "" || !codeShape.MatchString(reset.Code) {
		t.Fatal("reset mail lacks link or code")
	}
	must(s.CheckCode(ctx, CodeProof{Email: verify.To, Code: reset.Code}))
	bad := "000000"
	if reset.Code == bad {
		bad = "111111"
	}
	if _, err = s.CompleteCode(ctx, CodeProof{Email: verify.To, Code: bad}, testdb.Password); !errors.Is(err, ErrLink) {
		t.Fatal("wrong reset code", err)
	}
	other, err := s.Login(ctx, verify.To, testdb.Password, "")
	must(err)
	byReset, err := s.CompleteCode(ctx, CodeProof{Email: verify.To, Code: reset.Code}, "a reset synthetic password value")
	must(err)
	if _, err = s.Current(ctx, byReset); err != nil {
		t.Fatal("reset did not sign in", err)
	}
	if notice := latest("password-reset"); notice.Token != "" || notice.Code != "" {
		t.Fatal("reset notice carries a secret")
	}
	if _, err = s.Current(ctx, other); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("reset left an old session", err)
	}
	query(`DELETE FROM auth_rate_limits`)
	raw, err = s.Login(ctx, verify.To, "a reset synthetic password value", "")
	must(err)
	must(s.ForgotPassword(ctx, verify.To, "en"))
	reset = latest("reset")
	var successes atomic.Int32
	var wg sync.WaitGroup
	for range 2 {
		wg.Go(func() {
			if _, e := s.CompleteCode(ctx, CodeProof{Token: reset.Token}, "a replacement synthetic password"); e == nil {
				successes.Add(1)
			}
		})
	}
	wg.Wait()
	if successes.Load() != 1 {
		t.Fatal("concurrent consumption", successes.Load())
	}
	if _, err = s.Current(ctx, raw); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("reset sessions survived", err)
	}
	query(`DELETE FROM auth_rate_limits`)
	raw, err = s.Login(ctx, verify.To, "a replacement synthetic password", "")
	must(err)
	must(s.ChangeCredential(ctx, raw, "", "new@example.test"))
	var sealed []byte
	// Find purpose without relying on ordering among jobs in one transaction.
	rows, err := admin.Query(ctx, `SELECT payload FROM mail_outbox WHERE payload IS NOT NULL`)
	must(err)
	var emailToken string
	for rows.Next() {
		must(rows.Scan(&sealed))
		n := s.mailCipher.NonceSize()
		plain, e := s.mailCipher.Open(nil, sealed[:n], sealed[n:], []byte("calirestore-mail-v1"))
		must(e)
		var p mailer.Payload
		must(json.Unmarshal(plain, &p))
		if p.Purpose == "email" {
			emailToken = p.Token
		}
	}
	rows.Close()
	must(rows.Err())
	if emailToken == "" {
		t.Fatal("no email token")
	}
	must(s.ConsumeLink(ctx, emailToken, "email"))
	if _, err = s.Current(ctx, raw); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("email sessions survived", err)
	}
	query(`DELETE FROM auth_rate_limits`)
	raw, err = s.Login(ctx, "new@example.test", "a replacement synthetic password", "")
	must(err)
	current, err := s.Current(ctx, raw)
	must(err)
	query(`UPDATE sessions SET verified_at=now()-interval '6 minutes' WHERE id=$1`, current.ID)
	if err = s.ChangeCredential(ctx, raw, "new synthetic password value", ""); !errors.Is(err, ErrRecent) {
		t.Fatal("stale confirmation", err)
	}
	raw, err = s.Login(ctx, "new@example.test", "a replacement synthetic password", raw)
	must(err)
	must(s.ChangeCredential(ctx, raw, "new synthetic password value", ""))
	if _, err = s.Current(ctx, raw); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("password sessions survived", err)
	}
	// An address with no account gets a sign-up code worded as "not registered yet".
	must(s.ForgotPassword(ctx, "unknown@example.test", "en"))
	if unknown := latest("not-registered"); unknown.Token == "" || !codeShape.MatchString(unknown.Code) {
		t.Fatal("not-registered mail lacks link or code")
	}
	must(admin.QueryRow(ctx, `SELECT kind FROM mail_outbox ORDER BY created_at DESC,id DESC LIMIT 1`).Scan(&kind))
	if kind != "verify" {
		t.Fatal("not-registered kind", kind)
	}
	// Retry survives a fresh service instance, erases payload on success, and
	// concurrent workers use SKIP LOCKED rather than duplicate delivery.
	query(`DELETE FROM mail_outbox`)
	must(s.ForgotPassword(ctx, "new@example.test", "hu"))
	must(s.DeliverMail(ctx, func(context.Context, string, string, string, string) error {
		return errors.New("synthetic SMTP failure")
	}))
	var attempts int
	var status string
	must(admin.QueryRow(ctx, `SELECT attempts,status FROM mail_outbox`).Scan(&attempts, &status))
	if attempts != 1 || status != "pending" {
		t.Fatal("retry state")
	}
	query(`UPDATE mail_outbox SET available_at=now()`)
	restarted, err := New(app)
	must(err)
	must(restarted.ConfigureMail(key, s.origin))
	var sent atomic.Int32
	send := func(_ context.Context, to, subject, body, html string) error {
		if to != "new@example.test" || !strings.Contains(body, "#token=") || !strings.Contains(body, "15 perc") || !strings.Contains(html, "<h1") {
			t.Error("localized message/link")
		}
		sent.Add(1)
		time.Sleep(20 * time.Millisecond)
		return nil
	}
	for range 2 {
		wg.Go(func() {
			if err := restarted.DeliverMail(ctx, send); err != nil {
				t.Error(err)
			}
		})
	}
	wg.Wait()
	if sent.Load() != 1 {
		t.Fatal("duplicate worker delivery")
	}
	var erased bool
	must(admin.QueryRow(ctx, `SELECT payload IS NULL,status FROM mail_outbox`).Scan(&erased, &status))
	if !erased || status != "sent" {
		t.Fatal("sent payload retained")
	}
	query(`DELETE FROM auth_rate_limits`)
	query(`DELETE FROM mail_outbox`)
	must(s.ForgotPassword(ctx, "new@example.test", "en"))
	for range 8 {
		query(`UPDATE mail_outbox SET available_at=now()`)
		must(s.DeliverMail(ctx, func(context.Context, string, string, string, string) error {
			return errors.New("synthetic permanent failure")
		}))
	}
	must(admin.QueryRow(ctx, `SELECT payload IS NULL,status,attempts FROM mail_outbox`).Scan(&erased, &status, &attempts))
	if !erased || status != "failed" || attempts != 8 {
		t.Fatal("terminal retry payload retained")
	}
	query(`DELETE FROM mail_outbox`)
	must(s.ForgotPassword(ctx, "new@example.test", "en"))
	stale := latest("reset")
	must(Bootstrap(ctx, admin, "operator@example.test", testdb.Password))
	operator, err := s.Login(ctx, "operator@example.test", testdb.Password, "")
	must(err)
	must(s.SetPolicy(ctx, operator, current.Account.ID, "member", "suspended"))
	if _, err = s.CompleteCode(ctx, CodeProof{Token: stale.Token}, testdb.Password); !errors.Is(err, ErrLink) {
		t.Fatal("suspended reset", err)
	}
	must(s.SetPolicy(ctx, operator, current.Account.ID, "member", "active"))
	if _, err = s.CompleteCode(ctx, CodeProof{Token: stale.Token}, testdb.Password); !errors.Is(err, ErrLink) {
		t.Fatal("old link resurrected", err)
	}
	query(`UPDATE mail_outbox SET expires_at=now()-interval '1 second'`)
	must(s.DeliverMail(ctx, func(context.Context, string, string, string, string) error { t.Error("expired mail sent"); return nil }))
}

func TestMailKeyAndTemplates(t *testing.T) {
	s := &Service{}
	if s.ConfigureMail(make([]byte, 16), "https://example.test") == nil {
		t.Fatal("short key")
	}
	for _, lang := range []string{"en", "hu"} {
		for _, purpose := range []string{"verify", "not-registered", "reset", "email", "security", "account-exists", "project-invitation", "welcome", "password-reset", "password-changed"} {
			subject, body := mailer.Text(mailer.Payload{Language: lang, Purpose: purpose}, "https://example.test")
			if subject == "" || body == "" || strings.Contains(body, "token=") {
				t.Fatal("template")
			}
		}
		_, exists := mailer.Text(mailer.Payload{Language: lang, Purpose: "account-exists", To: "a+b@example.test"}, "https://example.test")
		if !strings.Contains(exists, "https://example.test/login#email=a%2Bb%40example.test") {
			t.Fatal("account-exists link lacks the address", exists)
		}
		for purpose, route := range map[string]string{"verify": "/verify-email", "not-registered": "/verify-email", "reset": "/reset-password"} {
			p := mailer.Payload{Language: lang, Purpose: purpose, Token: "t", Code: "123456"}
			subject, body := mailer.Text(p, "https://example.test")
			html := mailer.HTML(p, "https://example.test")
			if !strings.HasPrefix(subject, "123456") || !strings.Contains(body, "123456") || !strings.Contains(body, route+"#token=t") {
				t.Fatal("mail lacks code or link", purpose)
			}
			if !strings.Contains(html, `href="https://example.test`+route+`#token=t"`) || !strings.Contains(html, "1 2 3") || !strings.Contains(html, `lang="`+lang+`"`) {
				t.Fatal("html mail lacks code or link", purpose)
			}
		}
	}
}
