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
)

func TestPostgresLifecycle(t *testing.T) {
	admin, app := identityDB(t)
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
	latest := func(purpose string) mailPayload {
		t.Helper()
		var sealed []byte
		must(admin.QueryRow(ctx, `SELECT payload FROM mail_outbox WHERE payload IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 1`).Scan(&sealed))
		n := s.mailCipher.NonceSize()
		plain, err := s.mailCipher.Open(nil, sealed[:n], sealed[n:], []byte("calirestore-mail-v1"))
		must(err)
		var p mailPayload
		must(json.Unmarshal(plain, &p))
		if p.Purpose != purpose {
			t.Fatalf("purpose %s", p.Purpose)
		}
		if strings.Contains(string(sealed), p.Token) && p.Token != "" {
			t.Fatal("plaintext token in outbox")
		}
		return p
	}
	must(s.RegisterAccount(ctx, "member@example.test", testPassword, "hu"))
	verify := latest("verify")
	if _, err = s.Login(ctx, verify.To, testPassword, ""); !errors.Is(err, ErrCredentials) {
		t.Fatal("unverified login", err)
	}
	// Duplicate registration never replaces a pending verifier or adds another job.
	must(s.RegisterAccount(ctx, verify.To, "another synthetic long password", "en"))
	var count int
	must(admin.QueryRow(ctx, `SELECT count(*) FROM mail_outbox`).Scan(&count))
	if count != 1 {
		t.Fatal("duplicate register mail")
	}
	if err = s.ConsumeLink(ctx, verify.Token, "reset", testPassword); !errors.Is(err, ErrLink) {
		t.Fatal("purpose bypass", err)
	}
	must(s.ConsumeLink(ctx, verify.Token, "verify", ""))
	if err = s.ConsumeLink(ctx, verify.Token, "verify", ""); !errors.Is(err, ErrLink) {
		t.Fatal("replay", err)
	}
	raw, err := s.Login(ctx, verify.To, testPassword, "")
	must(err)
	must(s.RequestLink(ctx, verify.To, "hu", "reset"))
	reset := latest("reset")
	query(`UPDATE identity_links SET expires_at=now()-interval '1 second'`)
	if err = s.ConsumeLink(ctx, reset.Token, "reset", testPassword); !errors.Is(err, ErrLink) {
		t.Fatal("expired", err)
	}
	must(s.RequestLink(ctx, verify.To, "en", "reset"))
	reset = latest("reset")
	var successes atomic.Int32
	var wg sync.WaitGroup
	for range 2 {
		wg.Go(func() {
			if s.ConsumeLink(ctx, reset.Token, "reset", "a replacement synthetic password") == nil {
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
		var p mailPayload
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
	must(s.ConsumeLink(ctx, emailToken, "email", ""))
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
	must(s.RequestLink(ctx, "unknown@example.test", "en", "reset"))
	// Retry survives a fresh service instance, erases payload on success, and
	// concurrent workers use SKIP LOCKED rather than duplicate delivery.
	query(`DELETE FROM mail_outbox`)
	must(s.RequestLink(ctx, "new@example.test", "hu", "reset"))
	must(s.DeliverMail(ctx, func(context.Context, string, string, string) error { return errors.New("synthetic SMTP failure") }))
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
	send := func(_ context.Context, to, subject, body string) error {
		if to != "new@example.test" || !strings.Contains(body, "#token=") || !strings.Contains(body, "30 perc") {
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
	must(s.RequestLink(ctx, "new@example.test", "en", "reset"))
	for range 8 {
		query(`UPDATE mail_outbox SET available_at=now()`)
		must(s.DeliverMail(ctx, func(context.Context, string, string, string) error { return errors.New("synthetic permanent failure") }))
	}
	must(admin.QueryRow(ctx, `SELECT payload IS NULL,status,attempts FROM mail_outbox`).Scan(&erased, &status, &attempts))
	if !erased || status != "failed" || attempts != 8 {
		t.Fatal("terminal retry payload retained")
	}
	query(`DELETE FROM mail_outbox`)
	must(s.RequestLink(ctx, "new@example.test", "en", "reset"))
	stale := latest("reset")
	must(Bootstrap(ctx, admin, "operator@example.test", testPassword))
	operator, err := s.Login(ctx, "operator@example.test", testPassword, "")
	must(err)
	must(s.SetPolicy(ctx, operator, current.Account.ID, "member", "suspended"))
	if err = s.ConsumeLink(ctx, stale.Token, "reset", testPassword); !errors.Is(err, ErrLink) {
		t.Fatal("suspended reset", err)
	}
	must(s.SetPolicy(ctx, operator, current.Account.ID, "member", "active"))
	if err = s.ConsumeLink(ctx, stale.Token, "reset", testPassword); !errors.Is(err, ErrLink) {
		t.Fatal("old link resurrected", err)
	}
	query(`UPDATE mail_outbox SET expires_at=now()-interval '1 second'`)
	must(s.DeliverMail(ctx, func(context.Context, string, string, string) error { t.Error("expired mail sent"); return nil }))
}

func TestMailKeyAndTemplates(t *testing.T) {
	s := &Service{}
	if s.ConfigureMail(make([]byte, 16), "https://example.test") == nil {
		t.Fatal("short key")
	}
	for _, lang := range []string{"en", "hu"} {
		for _, purpose := range []string{"verify", "reset", "email", "security"} {
			subject, body := MailText(mailPayload{Language: lang, Purpose: purpose}, "https://example.test")
			if subject == "" || body == "" || strings.Contains(body, "token=") {
				t.Fatal("template")
			}
		}
	}
}
