package identity

import (
	"context"
	"crypto/cipher"
	"errors"
	"net/mail"
	"strings"
	"time"

	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sicza95/cali-restore-pro/server/internal/identity/passhash"
	"github.com/sicza95/cali-restore-pro/server/internal/identity/sessiontoken"
)

var (
	ErrInvalid      = errors.New("invalid request")
	ErrCredentials  = errors.New("invalid credentials")
	ErrUnauthorized = errors.New("authentication required")
	ErrForbidden    = errors.New("not permitted")
	ErrRecent       = errors.New("recent credential verification required")
	ErrConflict     = errors.New("identity change conflicts with account safeguards")
	ErrLimited      = errors.New("try again later")
)

const MutationLock = 72401601
const maxSessions = 20

type Service struct {
	pool       *pgxpool.Pool
	slots      chan struct{}
	dummy      string
	mailCipher cipher.AEAD
	origin     string
	// relyingParty is nil when APP_ORIGIN cannot host passkeys (IP address).
	relyingParty *webauthn.WebAuthn
}

type Session struct {
	ID         string    `json:"id"`
	Account    Account   `json:"account"`
	CreatedAt  time.Time `json:"createdAt"`
	VerifiedAt time.Time `json:"verifiedAt"`
}

func New(pool *pgxpool.Pool) (*Service, error) {
	dummy, err := passhash.Hash("unavailable-account-dummy-verifier")
	return &Service{pool: pool, slots: make(chan struct{}, 2), dummy: dummy}, err
}

func NormalizeEmail(email string) (string, bool) {
	email = strings.ToLower(strings.TrimSpace(email))
	if len(email) > 254 || strings.IndexFunc(email, func(r rune) bool { return r > 127 }) >= 0 {
		return "", false
	}
	parsed, err := mail.ParseAddress(email)
	return email, err == nil && parsed.Address == email && !strings.ContainsAny(email, "\r\n")
}

type rowQuery interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func LookupSession(ctx context.Context, q rowQuery, raw string) (Session, error) {
	var s Session
	if !sessiontoken.Valid(raw) {
		return s, ErrUnauthorized
	}
	err := q.QueryRow(ctx, `SELECT s.id, a.id, a.email, a.state, a.role, a.admin_permissions, s.created_at, s.verified_at
        FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_digest=$1 AND a.state='active'`, sessiontoken.Digest(raw)).Scan(
		&s.ID, &s.Account.ID, &s.Account.Email, &s.Account.State, &s.Account.Role, &s.Account.AdminPermissions, &s.CreatedAt, &s.VerifiedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return s, ErrUnauthorized
	}
	return s, err
}

func (s *Service) Current(ctx context.Context, raw string) (Session, error) {
	return LookupSession(ctx, s.pool, raw)
}

func beginMutation(ctx context.Context, pool *pgxpool.Pool) (pgx.Tx, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", MutationLock); err != nil {
		_ = tx.Rollback(context.Background())
		return nil, err
	}
	return tx, nil
}

// Fixed windows are shared by all API processes. No IP, User-Agent or raw
// attempted address is retained; address hashes are pseudonymous, not anonymous.
func (s *Service) Rate(ctx context.Context, email string) error {
	return s.rate(ctx, bucket{"global", 60, 120}, bucket{"account:" + email, 900, 10})
}

type bucket struct {
	key            string
	seconds, limit int
}

func (s *Service) rate(ctx context.Context, buckets ...bucket) error {
	for _, b := range buckets {
		result, err := s.pool.Exec(ctx, `INSERT INTO auth_rate_limits (bucket,window_at,attempts)
            VALUES ($1, date_bin(make_interval(secs => $2), clock_timestamp(), '2000-01-01'::timestamptz), 1)
            ON CONFLICT (bucket,window_at) DO UPDATE SET attempts=auth_rate_limits.attempts+1
            WHERE auth_rate_limits.attempts < $3`, sessiontoken.Digest(b.key), b.seconds, b.limit)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return ErrLimited
		}
	}
	_, err := s.pool.Exec(ctx, `DELETE FROM auth_rate_limits WHERE window_at < now() - interval '15 minutes'`)
	return err
}

func (s *Service) checkPassword(ctx context.Context, email, password string) (Account, string, error) {
	return s.CheckPasswordState(ctx, email, password, "active")
}

func (s *Service) CheckPasswordState(ctx context.Context, email, password, state string) (Account, string, error) {
	var a Account
	email, valid := NormalizeEmail(email)
	if !valid {
		email = "invalid"
	}
	if err := s.Rate(ctx, email); err != nil {
		return a, "", err
	}
	select {
	case s.slots <- struct{}{}:
		defer func() { <-s.slots }()
	default:
		return a, "", ErrLimited
	}
	verifier := s.dummy
	err := s.pool.QueryRow(ctx, `SELECT id,email,state,role,password_hash FROM accounts WHERE email=$1`, email).Scan(&a.ID, &a.Email, &a.State, &a.Role, &verifier)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return a, "", err
	}
	matches := passhash.Verify(verifier, password)
	if !matches || err != nil || !valid || a.State != state {
		return Account{}, "", ErrCredentials
	}
	return a, verifier, nil
}

// Login and credential confirmation issue fresh opaque IDs. There is no idle or
// absolute expiry: the owner's manual sign-out policy is deliberate. Suspension,
// policy changes, explicit revocation and later password reset end sessions.
func (s *Service) Login(ctx context.Context, email, password, replace string) (string, error) {
	a, verifier, err := s.checkPassword(ctx, email, password)
	if err != nil {
		return "", err
	}
	tx, err := beginMutation(ctx, s.pool)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(context.Background())
	if replace != "" {
		current, err := LookupSession(ctx, tx, replace)
		if err != nil {
			return "", err
		}
		if current.Account.ID != a.ID {
			return "", ErrForbidden
		}
		if _, err = tx.Exec(ctx, `DELETE FROM sessions WHERE id=$1`, current.ID); err != nil {
			return "", err
		}
	}
	// Lock against credential/account transitions after password hashing.
	var currentHash, state string
	if err = tx.QueryRow(ctx, `SELECT password_hash,state FROM accounts WHERE id=$1 FOR UPDATE`, a.ID).Scan(&currentHash, &state); err != nil {
		return "", err
	}
	if currentHash != verifier || state != "active" {
		return "", ErrCredentials
	}
	var count int
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM sessions WHERE account_id=$1`, a.ID).Scan(&count); err != nil {
		return "", err
	}
	if count >= maxSessions {
		return "", ErrConflict
	}
	raw := sessiontoken.New()
	if _, err = tx.Exec(ctx, `INSERT INTO sessions (account_id,token_digest) VALUES ($1,$2)`, a.ID, sessiontoken.Digest(raw)); err != nil {
		return "", err
	}
	return raw, tx.Commit(ctx)
}

func (s *Service) Logout(ctx context.Context, raw string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE token_digest=$1`, sessiontoken.Digest(raw))
	return err
}

type SessionInfo struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"createdAt"`
	Current   bool      `json:"current"`
}

func (s *Service) Sessions(ctx context.Context, raw string) ([]SessionInfo, error) {
	// One statement observes both the current account/session and its list.
	rows, err := s.pool.Query(ctx, `SELECT other.id, other.created_at, other.id=own.id FROM sessions own
        JOIN accounts a ON a.id=own.account_id AND a.state='active'
        JOIN sessions other ON other.account_id=a.id WHERE own.token_digest=$1 ORDER BY other.created_at,other.id`, sessiontoken.Digest(raw))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []SessionInfo{}
	for rows.Next() {
		var item SessionInfo
		if err := rows.Scan(&item.ID, &item.CreatedAt, &item.Current); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(result) == 0 {
		return nil, ErrUnauthorized
	}
	return result, nil
}

func RequireRecent(s Session) error {
	if time.Since(s.VerifiedAt) > 5*time.Minute {
		return ErrRecent
	}
	return nil
}

// An empty sessionID revokes all sessions of the subject, including the actor's
// current one if it belongs to that account. Cross-account IDs never act as own.
func (s *Service) Revoke(ctx context.Context, raw, subject, sessionID string) error {
	return s.revoke(ctx, raw, subject, sessionID, false)
}

func (s *Service) revoke(ctx context.Context, raw, subject, sessionID string, adminRoute bool) error {
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
	if adminRoute || actor.Account.ID != subject {
		if !actor.Account.Allows(RevokeAccountSessions) {
			return ErrForbidden
		}
		var role string
		if err = tx.QueryRow(ctx, `SELECT role FROM accounts WHERE id=$1 FOR UPDATE`, subject).Scan(&role); errors.Is(err, pgx.ErrNoRows) {
			return ErrForbidden
		} else if err != nil {
			return err
		}
		if actor.Account.Role != "superuser" && role != "member" {
			return ErrForbidden
		}
	}
	if sessionID == "" {
		_, err = tx.Exec(ctx, `DELETE FROM sessions WHERE account_id=$1`, subject)
	} else {
		_, err = tx.Exec(ctx, `DELETE FROM sessions WHERE account_id=$1 AND id=$2`, subject, sessionID)
	}
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO identity_audit(actor_id,subject_id,action) VALUES ($1,$2,'sessions_revoked')`, actor.Account.ID, subject); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Service) SetPolicy(ctx context.Context, raw, subject, role, state string) error {
	if (role != "member" && role != "administrator" && role != "superuser") || (state != "active" && state != "suspended") {
		return ErrForbidden
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
	var oldRole, oldState string
	if err = tx.QueryRow(ctx, `SELECT role,state FROM accounts WHERE id=$1 FOR UPDATE`, subject).Scan(&oldRole, &oldState); errors.Is(err, pgx.ErrNoRows) {
		return ErrForbidden
	} else if err != nil {
		return err
	}
	if !actor.Account.Allows(SuspendAccounts) {
		return ErrForbidden
	}
	if oldRole != role && !actor.Account.Allows(ManageRoles) {
		return ErrForbidden
	}
	if actor.Account.Role != "superuser" && oldRole != "member" {
		return ErrForbidden
	}
	// Verification/deletion are distinct lifecycles, never bypassed by activate.
	if oldState != "active" && oldState != "suspended" {
		return ErrConflict
	}
	if oldRole == role && oldState == state {
		return tx.Commit(ctx)
	}
	if _, err = tx.Exec(ctx, `UPDATE accounts SET role=$2,state=$3,admin_permissions=CASE WHEN role=$2 THEN admin_permissions ELSE 0 END WHERE id=$1`, subject, role, state); err != nil {
		if pgErrCode(err) == "23514" {
			return ErrConflict
		}
		return err
	}
	if _, err = tx.Exec(ctx, `DELETE FROM identity_links WHERE account_id=$1`, subject); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `DELETE FROM sessions WHERE account_id=$1`, subject); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO identity_audit(actor_id,subject_id,action) VALUES ($1,$2,'policy_changed')`, actor.Account.ID, subject); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
