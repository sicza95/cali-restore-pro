package identity

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-webauthn/webauthn/protocol/webauthncbor"
	"github.com/go-webauthn/webauthn/protocol/webauthncose"
	"github.com/sicza95/cali-restore-pro/server/internal/identity/passhash"
	"github.com/sicza95/cali-restore-pro/server/internal/testdb"
)

const passkeyOrigin = "http://localhost:8080"

var b64 = base64.RawURLEncoding

// softAuthenticator is a minimal ES256 platform authenticator: "none"
// attestation, user verification, and a caller-controlled signature counter.
type softAuthenticator struct {
	key    *ecdsa.PrivateKey
	id     []byte
	handle []byte
	count  uint32
	flags  byte
}

func newSoftAuthenticator(t *testing.T, flags byte) *softAuthenticator {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	id := make([]byte, 32)
	_, _ = rand.Read(id)
	return &softAuthenticator{key: key, id: id, flags: flags}
}

func clientData(t *testing.T, kind string, options any) ([]byte, map[string]any) {
	t.Helper()
	encoded, err := json.Marshal(options)
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]any
	if err := json.Unmarshal(encoded, &fields); err != nil {
		t.Fatal(err)
	}
	data, _ := json.Marshal(map[string]any{"type": kind, "challenge": fields["challenge"], "origin": passkeyOrigin, "crossOrigin": false})
	return data, fields
}

func (a *softAuthenticator) authData(attested []byte) []byte {
	rp := sha256.Sum256([]byte("localhost"))
	out := append([]byte{}, rp[:]...)
	flags := a.flags | 0x01 | 0x04 // user present and verified
	if attested != nil {
		flags |= 0x40
	}
	out = append(out, flags)
	out = binary.BigEndian.AppendUint32(out, a.count)
	return append(out, attested...)
}

func (a *softAuthenticator) create(t *testing.T, options any) []byte {
	t.Helper()
	client, fields := clientData(t, "webauthn.create", options)
	handle, err := b64.DecodeString(fields["user"].(map[string]any)["id"].(string))
	if err != nil {
		t.Fatal(err)
	}
	a.handle = handle
	cose, err := webauthncbor.Marshal(webauthncose.EC2PublicKeyData{
		PublicKeyData: webauthncose.PublicKeyData{KeyType: int64(webauthncose.EllipticKey), Algorithm: int64(webauthncose.AlgES256)},
		Curve:         1, XCoord: a.key.X.FillBytes(make([]byte, 32)), YCoord: a.key.Y.FillBytes(make([]byte, 32)),
	})
	if err != nil {
		t.Fatal(err)
	}
	attested := append(make([]byte, 16), byte(len(a.id)>>8), byte(len(a.id)))
	attested = append(append(attested, a.id...), cose...)
	object, err := webauthncbor.Marshal(map[string]any{"fmt": "none", "attStmt": map[string]any{}, "authData": a.authData(attested)})
	if err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]any{"id": b64.EncodeToString(a.id), "rawId": b64.EncodeToString(a.id), "type": "public-key",
		"response":               map[string]any{"clientDataJSON": b64.EncodeToString(client), "attestationObject": b64.EncodeToString(object), "transports": []string{"internal"}},
		"clientExtensionResults": map[string]any{}})
	return body
}

func (a *softAuthenticator) get(t *testing.T, options any) []byte {
	t.Helper()
	client, _ := clientData(t, "webauthn.get", options)
	data := a.authData(nil)
	hash := sha256.Sum256(client)
	digest := sha256.Sum256(append(append([]byte{}, data...), hash[:]...))
	signature, err := ecdsa.SignASN1(rand.Reader, a.key, digest[:])
	if err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]any{"id": b64.EncodeToString(a.id), "rawId": b64.EncodeToString(a.id), "type": "public-key",
		"response": map[string]any{"clientDataJSON": b64.EncodeToString(client), "authenticatorData": b64.EncodeToString(data),
			"signature": b64.EncodeToString(signature), "userHandle": b64.EncodeToString(a.handle)},
		"clientExtensionResults": map[string]any{}})
	return body
}

func TestPasskeysUnavailableOnIPOrigins(t *testing.T) {
	s := &Service{}
	for _, origin := range []string{"http://127.0.0.1:8080", "http://[::1]:8080", "not a url"} {
		if err := s.ConfigurePasskeys(origin); !errors.Is(err, ErrPasskeysUnavailable) || s.PasskeysAvailable() {
			t.Fatal(origin, err)
		}
	}
	if _, _, err := s.BeginPasskeyLogin(context.Background()); !errors.Is(err, ErrPasskeysUnavailable) {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	NewHTTP(s, passkeyOrigin, false).passkeyRoutes(NewHTTP(s, passkeyOrigin, false).Guard(mux))
	req := httptest.NewRequest("POST", "/api/v1/auth/passkey-login/options", strings.NewReader(`{}`))
	req.Header.Set("Origin", passkeyOrigin)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 404 || !strings.Contains(rec.Body.String(), "passkeys_unavailable") {
		t.Fatal(rec.Code, rec.Body.String())
	}
	for _, name := range []string{"", "   ", strings.Repeat("x", 65), "tab\tname"} {
		if _, ok := passkeyName(name); ok {
			t.Fatal("accepted name", name)
		}
	}
	if name, ok := passkeyName("  Studio iPad  "); !ok || name != "Studio iPad" {
		t.Fatal(name)
	}
}

func TestPostgresPasskeys(t *testing.T) {
	admin, app := testdb.New(t)
	ctx := context.Background()
	s, err := New(app)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.ConfigureMail(make([]byte, 32), passkeyOrigin); err != nil {
		t.Fatal(err)
	}
	if err := s.ConfigurePasskeys(passkeyOrigin); err != nil {
		t.Fatal(err)
	}
	hash, err := passhash.Hash(testdb.Password)
	if err != nil {
		t.Fatal(err)
	}
	ids := map[string]string{}
	for _, name := range []string{"owner", "other"} {
		var id string
		if err := admin.QueryRow(ctx, `INSERT INTO accounts(email,password_hash,state) VALUES ($1,$2,'active') RETURNING id`, name+"@example.test", hash).Scan(&id); err != nil {
			t.Fatal(err)
		}
		ids[name] = id
	}
	login := func(name string) string {
		t.Helper()
		raw, err := s.Login(ctx, name+"@example.test", testdb.Password, "")
		if err != nil {
			t.Fatal(err)
		}
		return raw
	}
	count := func(sql string, args ...any) int {
		t.Helper()
		var n int
		if err := admin.QueryRow(ctx, sql, args...).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	register := func(raw string, a *softAuthenticator, name string) error {
		t.Helper()
		options, ceremony, err := s.BeginPasskeyRegistration(ctx, raw)
		if err != nil {
			return err
		}
		return s.FinishPasskeyRegistration(ctx, raw, ceremony, name, a.create(t, options))
	}
	signIn := func(a *softAuthenticator) (string, error) {
		t.Helper()
		options, ceremony, err := s.BeginPasskeyLogin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		return s.FinishPasskeyLogin(ctx, ceremony, a.get(t, options))
	}
	owner := login("owner")
	device := newSoftAuthenticator(t, 0x08|0x10) // backup eligible and backed up
	t.Run("registration needs a recent password confirmation and a fresh ceremony", func(t *testing.T) {
		if _, err := admin.Exec(ctx, `UPDATE sessions SET verified_at=now()-interval '1 hour'`); err != nil {
			t.Fatal(err)
		}
		if _, _, err := s.BeginPasskeyRegistration(ctx, owner); !errors.Is(err, ErrRecent) {
			t.Fatal(err)
		}
		owner = login("owner")
		options, ceremony, err := s.BeginPasskeyRegistration(ctx, owner)
		if err != nil {
			t.Fatal(err)
		}
		body := device.create(t, options)
		if err := s.FinishPasskeyRegistration(ctx, owner, strings.Repeat("A", 43), "Studio", body); !errors.Is(err, ErrPasskey) {
			t.Fatal("unknown ceremony", err)
		}
		if err := s.FinishPasskeyRegistration(ctx, login("other"), ceremony, "Studio", body); !errors.Is(err, ErrPasskey) {
			t.Fatal("ceremony crossed sessions", err)
		}
		if err := s.FinishPasskeyRegistration(ctx, owner, ceremony, "Studio", body); err != nil {
			t.Fatal(err)
		}
		if err := s.FinishPasskeyRegistration(ctx, owner, ceremony, "Studio", body); !errors.Is(err, ErrPasskey) {
			t.Fatal("ceremony replayed", err)
		}
		if err := register(owner, device, "Again"); !errors.Is(err, ErrConflict) {
			t.Fatal("duplicate credential", err)
		}
		list, err := s.Passkeys(ctx, owner)
		if err != nil || len(list) != 1 || list[0].Name != "Studio" || !list[0].BackupEligible || !list[0].BackupState || list[0].LastUsedAt != nil {
			t.Fatal(list, err)
		}
		if n := count(`SELECT count(*) FROM identity_audit WHERE action='passkey_added' AND subject_id=$1`, ids["owner"]); n != 1 {
			t.Fatal("audit", n)
		}
		if n := count(`SELECT count(*) FROM mail_outbox WHERE account_id=$1 AND kind='security'`, ids["owner"]); n != 1 {
			t.Fatal("security mail", n)
		}
		if n := count(`SELECT count(*) FROM passkey_ceremonies`); n != 0 {
			t.Fatal("ceremony retained", n)
		}
	})
	t.Run("revoking the confirming session ends its ceremony", func(t *testing.T) {
		other := login("other")
		if _, _, err := s.BeginPasskeyRegistration(ctx, other); err != nil {
			t.Fatal(err)
		}
		if err := s.Logout(ctx, other); err != nil {
			t.Fatal(err)
		}
		if n := count(`SELECT count(*) FROM passkey_ceremonies`); n != 0 {
			t.Fatal("orphan ceremony", n)
		}
	})
	t.Run("discoverable sign-in issues a session that is not recently confirmed", func(t *testing.T) {
		device.count = 5
		raw, err := signIn(device)
		if err != nil {
			t.Fatal(err)
		}
		current, err := s.Current(ctx, raw)
		if err != nil || current.Account.ID != ids["owner"] {
			t.Fatal(current, err)
		}
		if err := RequireRecent(current); !errors.Is(err, ErrRecent) {
			t.Fatal("passkey session counts as password confirmation", err)
		}
		if _, _, err := s.BeginPasskeyRegistration(ctx, raw); !errors.Is(err, ErrRecent) {
			t.Fatal(err)
		}
		if n := count(`SELECT count(*) FROM passkeys WHERE sign_count=5 AND last_used_at IS NOT NULL`); n != 1 {
			t.Fatal("counter not stored", n)
		}
		options, ceremony, err := s.BeginPasskeyLogin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		device.count = 6
		body := device.get(t, options)
		_, other, err := s.BeginPasskeyLogin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := s.FinishPasskeyLogin(ctx, other, body); !errors.Is(err, ErrPasskey) {
			t.Fatal("assertion accepted for another challenge", err)
		}
		if _, err := s.FinishPasskeyLogin(ctx, ceremony, body); err != nil {
			t.Fatal(err)
		}
		if _, err := s.FinishPasskeyLogin(ctx, ceremony, body); !errors.Is(err, ErrPasskey) {
			t.Fatal("assertion replayed", err)
		}
	})
	t.Run("a counter that goes backwards is refused and flagged", func(t *testing.T) {
		device.count = 2
		if _, err := signIn(device); !errors.Is(err, ErrPasskey) {
			t.Fatal(err)
		}
		list, err := s.Passkeys(ctx, owner)
		if err != nil || len(list) != 1 || !list[0].CloneWarning {
			t.Fatal(list, err)
		}
		// A later assertion with an increasing counter signs in again; the
		// warning stays visible for the owner to review.
		device.count = 7
		if _, err := signIn(device); err != nil {
			t.Fatal("valid counter after a regression", err)
		}
		list, err = s.Passkeys(ctx, owner)
		if err != nil || len(list) != 1 || !list[0].CloneWarning {
			t.Fatal("warning cleared", list, err)
		}
		if _, err := admin.Exec(ctx, `UPDATE passkeys SET clone_warning=false`); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("unknown, suspended and forged passkeys are refused", func(t *testing.T) {
		stranger := newSoftAuthenticator(t, 0)
		stranger.handle = device.handle
		if _, err := signIn(stranger); !errors.Is(err, ErrPasskey) {
			t.Fatal("unknown credential", err)
		}
		if _, err := admin.Exec(ctx, `UPDATE accounts SET state='suspended' WHERE id=$1`, ids["owner"]); err != nil {
			t.Fatal(err)
		}
		device.count = 20
		if _, err := signIn(device); !errors.Is(err, ErrPasskey) {
			t.Fatal("suspended account", err)
		}
		if _, err := admin.Exec(ctx, `UPDATE accounts SET state='active' WHERE id=$1`, ids["owner"]); err != nil {
			t.Fatal(err)
		}
		if _, err := s.FinishPasskeyLogin(ctx, strings.Repeat("A", 43), []byte(`{"id":"x"}`)); !errors.Is(err, ErrPasskey) {
			t.Fatal("malformed assertion", err)
		}
	})
	t.Run("removal is owner-only, confirmed and audited", func(t *testing.T) {
		// The per-account window (10 attempts) is shared with password sign-in.
		if _, err := admin.Exec(ctx, `DELETE FROM auth_rate_limits`); err != nil {
			t.Fatal(err)
		}
		list, err := s.Passkeys(ctx, owner)
		if err != nil || len(list) != 1 {
			t.Fatal(list, err)
		}
		if err := s.RemovePasskey(ctx, login("other"), list[0].ID); !errors.Is(err, ErrForbidden) {
			t.Fatal("cross-account removal", err)
		}
		owner = login("owner")
		if err := s.RemovePasskey(ctx, owner, list[0].ID); err != nil {
			t.Fatal(err)
		}
		if n := count(`SELECT count(*) FROM identity_audit WHERE action='passkey_removed' AND subject_id=$1`, ids["owner"]); n != 1 {
			t.Fatal("audit", n)
		}
		device.count = 30
		if _, err := signIn(device); !errors.Is(err, ErrPasskey) {
			t.Fatal("removed passkey still signs in", err)
		}
		if _, err := s.Login(ctx, "owner@example.test", testdb.Password, ""); err != nil {
			t.Fatal("password sign-in broken", err)
		}
	})
	t.Run("the app role cannot rewrite ceremonies or record unknown audit actions", func(t *testing.T) {
		if _, err := app.Exec(ctx, `INSERT INTO identity_audit(actor_id,subject_id,action) VALUES($1,$1,'passkey_used')`, ids["owner"]); err == nil {
			t.Fatal("unknown audit action accepted")
		}
		if _, err := app.Exec(ctx, `UPDATE passkey_ceremonies SET purpose='login'`); err == nil {
			t.Fatal("app can rewrite ceremonies")
		}
	})
}
