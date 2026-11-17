package identity

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net"
	"net/url"
	"strings"
	"time"
	"unicode"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/jackc/pgx/v5"
	"github.com/sicza95/cali-restore-pro/server/internal/identity/sessiontoken"
)

// Passkeys are an optional sign-in factor only (ADR 0009): a verified assertion
// issues an ordinary session and never unlocks vault content.
var (
	ErrPasskey             = errors.New("passkey could not be verified")
	ErrPasskeysUnavailable = errors.New("passkeys unavailable for this origin")
)

const (
	maxPasskeys       = 10
	maxLoginChallenge = 500
	ceremonyLifetime  = 5 * time.Minute
)

type Passkey struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	CreatedAt      time.Time  `json:"createdAt"`
	LastUsedAt     *time.Time `json:"lastUsedAt"`
	BackupEligible bool       `json:"backupEligible"`
	BackupState    bool       `json:"backupState"`
	CloneWarning   bool       `json:"cloneWarning"`
}

type passkeyUser struct {
	id, email string
	handle    []byte
	creds     []webauthn.Credential
}

func (u passkeyUser) WebAuthnID() []byte                         { return u.handle }
func (u passkeyUser) WebAuthnName() string                       { return u.email }
func (u passkeyUser) WebAuthnDisplayName() string                { return u.email }
func (u passkeyUser) WebAuthnCredentials() []webauthn.Credential { return u.creds }

// ConfigurePasskeys derives the relying party from APP_ORIGIN. Browsers refuse
// IP-address relying party IDs, so such origins keep password sign-in only.
func (s *Service) ConfigurePasskeys(origin string) error {
	s.relyingParty = nil
	u, err := url.Parse(origin)
	if err != nil || u.Hostname() == "" || net.ParseIP(u.Hostname()) != nil {
		return ErrPasskeysUnavailable
	}
	timeout := webauthn.TimeoutConfig{Enforce: true, Timeout: ceremonyLifetime, TimeoutUVD: ceremonyLifetime}
	rp, err := webauthn.New(&webauthn.Config{
		RPID:                  u.Hostname(),
		RPDisplayName:         "CaliRestore Pro",
		RPOrigins:             []string{strings.TrimRight(origin, "/")},
		AttestationPreference: protocol.PreferNoAttestation,
		AuthenticatorSelection: protocol.AuthenticatorSelection{
			ResidentKey:        protocol.ResidentKeyRequirementRequired,
			RequireResidentKey: protocol.ResidentKeyRequired(),
			UserVerification:   protocol.VerificationRequired,
		},
		Timeouts: webauthn.TimeoutsConfig{Login: timeout, Registration: timeout},
	})
	if err != nil {
		return ErrPasskeysUnavailable
	}
	s.relyingParty = rp
	return nil
}

func (s *Service) PasskeysAvailable() bool { return s.relyingParty != nil }

func passkeyName(name string) (string, bool) {
	name = strings.TrimSpace(name)
	if name == "" || len([]rune(name)) > 64 || strings.IndexFunc(name, unicode.IsControl) >= 0 {
		return "", false
	}
	return name, true
}

func loadPasskeyUser(ctx context.Context, tx pgx.Tx, where string, arg any) (passkeyUser, error) {
	var u passkeyUser
	err := tx.QueryRow(ctx, `SELECT id,email,passkey_handle FROM accounts WHERE state='active' AND `+where+` FOR UPDATE`, arg).Scan(&u.id, &u.email, &u.handle)
	if err != nil {
		return u, err
	}
	rows, err := tx.Query(ctx, `SELECT credential_id,public_key,sign_count,flags,clone_warning,aaguid,attestation_type,attestation_format,transports,attachment
 FROM passkeys WHERE account_id=$1 ORDER BY created_at`, u.id)
	if err != nil {
		return u, err
	}
	u.creds, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (webauthn.Credential, error) {
		var c webauthn.Credential
		var count int64
		var flags int16
		var transports []string
		var attachment string
		err := row.Scan(&c.ID, &c.PublicKey, &count, &flags, &c.Authenticator.CloneWarning, &c.Authenticator.AAGUID, &c.AttestationType, &c.AttestationFormat, &transports, &attachment)
		c.Authenticator.SignCount = uint32(count)
		c.Authenticator.Attachment = protocol.AuthenticatorAttachment(attachment)
		c.Flags = webauthn.NewCredentialFlags(protocol.AuthenticatorFlags(flags))
		for _, t := range transports {
			c.Transport = append(c.Transport, protocol.AuthenticatorTransport(t))
		}
		return c, err
	})
	return u, err
}

func (s *Service) storeCeremony(ctx context.Context, tx pgx.Tx, purpose string, sessionID any, data *webauthn.SessionData) (string, error) {
	encoded, err := json.Marshal(data)
	if err != nil {
		return "", err
	}
	raw := sessiontoken.New()
	_, err = tx.Exec(ctx, `INSERT INTO passkey_ceremonies(token_digest,purpose,session_id,data,expires_at) VALUES($1,$2,$3,$4,$5)`,
		sessiontoken.Digest(raw), purpose, sessionID, encoded, data.Expires)
	return raw, err
}

// takeCeremony consumes the challenge before verification, so a failed or
// replayed response can never be retried against the same challenge.
func (s *Service) takeCeremony(ctx context.Context, raw, purpose string, sessionID any) (webauthn.SessionData, error) {
	var data webauthn.SessionData
	if !sessiontoken.Valid(raw) {
		return data, ErrPasskey
	}
	var encoded []byte
	err := s.pool.QueryRow(ctx, `DELETE FROM passkey_ceremonies WHERE token_digest=$1 AND purpose=$2
 AND session_id IS NOT DISTINCT FROM $3::uuid AND expires_at>clock_timestamp() RETURNING data`, sessiontoken.Digest(raw), purpose, sessionID).Scan(&encoded)
	if errors.Is(err, pgx.ErrNoRows) {
		return data, ErrPasskey
	}
	if err != nil {
		return data, err
	}
	if json.Unmarshal(encoded, &data) != nil {
		return data, ErrPasskey
	}
	return data, nil
}

// recentActor is the shared precondition of every passkey change: an active
// session confirmed by password within five minutes.
func (s *Service) recentActor(ctx context.Context, raw string) (Session, error) {
	if s.relyingParty == nil {
		return Session{}, ErrPasskeysUnavailable
	}
	current, err := s.Current(ctx, raw)
	if err != nil {
		return current, err
	}
	if err = RequireRecent(current); err != nil {
		return current, err
	}
	return current, s.Rate(ctx, current.Account.Email)
}

func (s *Service) Passkeys(ctx context.Context, raw string) ([]Passkey, error) {
	current, err := s.Current(ctx, raw)
	if err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `SELECT id,name,created_at,last_used_at,backup_eligible,backup_state,clone_warning
 FROM passkeys WHERE account_id=$1 ORDER BY created_at,id`, current.Account.ID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Passkey, error) {
		var p Passkey
		err := row.Scan(&p.ID, &p.Name, &p.CreatedAt, &p.LastUsedAt, &p.BackupEligible, &p.BackupState, &p.CloneWarning)
		return p, err
	})
}

func (s *Service) BeginPasskeyRegistration(ctx context.Context, raw string) (any, string, error) {
	if _, err := s.recentActor(ctx, raw); err != nil {
		return nil, "", err
	}
	tx, err := beginMutation(ctx, s.pool)
	if err != nil {
		return nil, "", err
	}
	defer tx.Rollback(context.Background())
	actor, err := LookupSession(ctx, tx, raw)
	if err != nil {
		return nil, "", err
	}
	if err = RequireRecent(actor); err != nil {
		return nil, "", err
	}
	handle := make([]byte, 32)
	_, _ = rand.Read(handle)
	if _, err = tx.Exec(ctx, `UPDATE accounts SET passkey_handle=coalesce(passkey_handle,$2) WHERE id=$1`, actor.Account.ID, handle); err != nil {
		return nil, "", err
	}
	user, err := loadPasskeyUser(ctx, tx, "id=$1", actor.Account.ID)
	if err != nil {
		return nil, "", err
	}
	if len(user.creds) >= maxPasskeys {
		return nil, "", ErrConflict
	}
	creation, data, err := s.relyingParty.BeginRegistration(user,
		webauthn.WithExclusions(webauthn.Credentials(user.creds).CredentialDescriptors()),
		webauthn.WithResidentKeyRequirement(protocol.ResidentKeyRequirementRequired))
	if err != nil {
		return nil, "", err
	}
	if _, err = tx.Exec(ctx, `DELETE FROM passkey_ceremonies WHERE session_id=$1 OR expires_at<=clock_timestamp()`, actor.ID); err != nil {
		return nil, "", err
	}
	ceremony, err := s.storeCeremony(ctx, tx, "register", actor.ID, data)
	if err != nil {
		return nil, "", err
	}
	return creation.Response, ceremony, tx.Commit(ctx)
}

func (s *Service) FinishPasskeyRegistration(ctx context.Context, raw, ceremony, name string, credential []byte) error {
	name, valid := passkeyName(name)
	if !valid {
		return ErrInvalid
	}
	current, err := s.recentActor(ctx, raw)
	if err != nil {
		return err
	}
	data, err := s.takeCeremony(ctx, ceremony, "register", current.ID)
	if err != nil {
		return err
	}
	parsed, err := protocol.ParseCredentialCreationResponseBytes(credential)
	if err != nil {
		return ErrPasskey
	}
	tx, err := beginMutation(ctx, s.pool)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	actor, err := LookupSession(ctx, tx, raw)
	if err != nil {
		return err
	}
	if err = RequireRecent(actor); err != nil {
		return err
	}
	user, err := loadPasskeyUser(ctx, tx, "id=$1", actor.Account.ID)
	if err != nil {
		return err
	}
	if len(user.creds) >= maxPasskeys {
		return ErrConflict
	}
	created, err := s.relyingParty.CreateCredential(user, data, parsed)
	if err != nil {
		return ErrPasskey
	}
	transports := []string{}
	for _, t := range created.Transport {
		if len(transports) < 8 && len(t) <= 32 {
			transports = append(transports, string(t))
		}
	}
	var aaguid []byte
	if len(created.Authenticator.AAGUID) == 16 {
		aaguid = created.Authenticator.AAGUID
	}
	tag, err := tx.Exec(ctx, `INSERT INTO passkeys(account_id,credential_id,public_key,name,sign_count,flags,backup_eligible,backup_state,aaguid,attestation_type,attestation_format,transports,attachment)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (credential_id) DO NOTHING`,
		user.id, created.ID, created.PublicKey, name, int64(created.Authenticator.SignCount), int16(created.Flags.ProtocolValue()),
		created.Flags.BackupEligible, created.Flags.BackupState, aaguid, created.AttestationType, created.AttestationFormat, transports, string(created.Authenticator.Attachment))
	if pgErrCode(err) == "23514" {
		return ErrPasskey
	}
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrConflict
	}
	return s.passkeyChanged(ctx, tx, user.id, user.email, "passkey_added")
}

func (s *Service) passkeyChanged(ctx context.Context, tx pgx.Tx, id, email, action string) error {
	var lang string
	if err := tx.QueryRow(ctx, `SELECT language FROM accounts WHERE id=$1`, id).Scan(&lang); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO identity_audit(actor_id,subject_id,action) VALUES($1,$1,$2)`, id, action); err != nil {
		return err
	}
	if err := s.Enqueue(ctx, tx, id, email, lang, "security", "", time.Now().Add(24*time.Hour)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Service) RemovePasskey(ctx context.Context, raw, id string) error {
	if _, err := s.recentActor(ctx, raw); err != nil {
		return err
	}
	tx, err := beginMutation(ctx, s.pool)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	actor, err := LookupSession(ctx, tx, raw)
	if err != nil {
		return err
	}
	if err = RequireRecent(actor); err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, `DELETE FROM passkeys WHERE id=$1 AND account_id=$2`, id, actor.Account.ID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrForbidden
	}
	return s.passkeyChanged(ctx, tx, actor.Account.ID, actor.Account.Email, "passkey_removed")
}

func (s *Service) BeginPasskeyLogin(ctx context.Context) (any, string, error) {
	if s.relyingParty == nil {
		return nil, "", ErrPasskeysUnavailable
	}
	if err := s.rate(ctx, bucket{"global", 60, 120}, bucket{"passkey-login", 60, 60}); err != nil {
		return nil, "", err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, "", err
	}
	defer tx.Rollback(context.Background())
	var pending int
	if _, err = tx.Exec(ctx, `DELETE FROM passkey_ceremonies WHERE expires_at<=clock_timestamp()`); err != nil {
		return nil, "", err
	}
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM passkey_ceremonies WHERE purpose='login'`).Scan(&pending); err != nil {
		return nil, "", err
	}
	if pending >= maxLoginChallenge {
		return nil, "", ErrLimited
	}
	assertion, data, err := s.relyingParty.BeginDiscoverableLogin(webauthn.WithUserVerification(protocol.VerificationRequired))
	if err != nil {
		return nil, "", err
	}
	ceremony, err := s.storeCeremony(ctx, tx, "login", nil, data)
	if err != nil {
		return nil, "", err
	}
	return assertion.Response, ceremony, tx.Commit(ctx)
}

// FinishPasskeyLogin issues a session whose credential confirmation is not
// recent: security changes still ask for the account password.
func (s *Service) FinishPasskeyLogin(ctx context.Context, ceremony string, credential []byte) (string, error) {
	if s.relyingParty == nil {
		return "", ErrPasskeysUnavailable
	}
	parsed, err := protocol.ParseCredentialRequestResponseBytes(credential)
	if err != nil {
		return "", ErrPasskey
	}
	if err = s.rate(ctx, bucket{"global", 60, 120}, bucket{"passkey:" + hex.EncodeToString(parsed.RawID), 900, 10}); err != nil {
		return "", err
	}
	data, err := s.takeCeremony(ctx, ceremony, "login", nil)
	if err != nil {
		return "", err
	}
	tx, err := beginMutation(ctx, s.pool)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(context.Background())
	var lookup error
	found, used, err := s.relyingParty.ValidatePasskeyLogin(func(_, handle []byte) (webauthn.User, error) {
		user, err := loadPasskeyUser(ctx, tx, "passkey_handle=$1", handle)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			lookup = err
		}
		return user, err
	}, data, parsed)
	if lookup != nil {
		return "", lookup
	}
	if err != nil {
		return "", ErrPasskey
	}
	user := found.(passkeyUser)
	if used.Authenticator.CloneWarning {
		// A counter that went backwards suggests a copied authenticator: refuse
		// and flag the passkey so the owner sees it on the security page.
		if _, err = tx.Exec(ctx, `UPDATE passkeys SET clone_warning=true WHERE credential_id=$1 AND account_id=$2`, used.ID, user.id); err != nil {
			return "", err
		}
		if err = tx.Commit(ctx); err != nil {
			return "", err
		}
		return "", ErrPasskey
	}
	if _, err = tx.Exec(ctx, `UPDATE passkeys SET sign_count=$3,flags=$4,backup_state=$5,last_used_at=now() WHERE credential_id=$1 AND account_id=$2`,
		used.ID, user.id, int64(used.Authenticator.SignCount), int16(used.Flags.ProtocolValue()), used.Flags.BackupState); err != nil {
		return "", err
	}
	var count int
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM sessions WHERE account_id=$1`, user.id).Scan(&count); err != nil {
		return "", err
	}
	if count >= maxSessions {
		return "", ErrConflict
	}
	raw := sessiontoken.New()
	if _, err = tx.Exec(ctx, `INSERT INTO sessions (account_id,token_digest,verified_at) VALUES ($1,$2,'epoch')`, user.id, sessiontoken.Digest(raw)); err != nil {
		return "", err
	}
	return raw, tx.Commit(ctx)
}
