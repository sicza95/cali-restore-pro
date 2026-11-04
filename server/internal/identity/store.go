package identity

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/mail"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrCredentials  = errors.New("invalid credentials")
	ErrUnauthorized = errors.New("authentication required")
	ErrForbidden    = errors.New("not permitted")
	ErrRecent       = errors.New("recent credential verification required")
	ErrConflict     = errors.New("identity change conflicts with account safeguards")
	ErrLimited      = errors.New("try again later")
)

const mutationLock = 72401601
const maxSessions = 20

type Service struct {
	pool  *pgxpool.Pool
	slots chan struct{}
	dummy string
}

type Session struct {
	ID         string    `json:"id"`
	Account    Account   `json:"account"`
	CreatedAt  time.Time `json:"createdAt"`
	VerifiedAt time.Time `json:"verifiedAt"`
}

func New(pool *pgxpool.Pool) (*Service, error) {
	dummy, err := HashPassword("unavailable-account-dummy-verifier")
	return &Service{pool: pool, slots: make(chan struct{}, 2), dummy: dummy}, err
}

func normalizeEmail(email string) (string, bool) {
	email = strings.ToLower(strings.TrimSpace(email))
	if len(email) > 254 || strings.IndexFunc(email, func(r rune) bool { return r > 127 }) >= 0 {
		return "", false
	}
	parsed, err := mail.ParseAddress(email)
	return email, err == nil && parsed.Address == email && !strings.ContainsAny(email, "\r\n")
}

func token() string {
	b := make([]byte, 32)
	// crypto/rand.Read never returns an error in the supported Go runtime.
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func digest(raw string) []byte {
	sum := sha256.Sum256([]byte(raw))
	return sum[:]
}

func validToken(raw string) bool {
	b, err := base64.RawURLEncoding.DecodeString(raw)
	return err == nil && len(b) == 32 && base64.RawURLEncoding.EncodeToString(b) == raw
}

func CSRF(raw string) string { return base64.RawURLEncoding.EncodeToString(digest("csrf:" + raw)) }

type rowQuery interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func session(ctx context.Context, q rowQuery, raw string) (Session, error) {
	var s Session
	if !validToken(raw) {
		return s, ErrUnauthorized
	}
	err := q.QueryRow(ctx, `SELECT s.id, a.id, a.email, a.state, a.role, s.created_at, s.verified_at
        FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_digest=$1 AND a.state='active'`, digest(raw)).Scan(
		&s.ID, &s.Account.ID, &s.Account.Email, &s.Account.State, &s.Account.Role, &s.CreatedAt, &s.VerifiedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return s, ErrUnauthorized
	}
	return s, err
}

func (s *Service) Current(ctx context.Context, raw string) (Session, error) {
	return session(ctx, s.pool, raw)
}

func beginMutation(ctx context.Context, pool *pgxpool.Pool) (pgx.Tx, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", mutationLock); err != nil {
		_ = tx.Rollback(context.Background())
		return nil, err
	}
	return tx, nil
}

// Fixed windows are shared by all API processes. No IP, User-Agent or raw
// attempted address is retained; address hashes are pseudonymous, not anonymous.
func (s *Service) rate(ctx context.Context, email string) error {
	for _, b := range []struct {
		key            string
		seconds, limit int
	}{{"global", 60, 120}, {"account:" + email, 900, 10}} {
		result, err := s.pool.Exec(ctx, `INSERT INTO auth_rate_limits (bucket,window_at,attempts)
            VALUES ($1, date_bin(make_interval(secs => $2), clock_timestamp(), '2000-01-01'::timestamptz), 1)
            ON CONFLICT (bucket,window_at) DO UPDATE SET attempts=auth_rate_limits.attempts+1
            WHERE auth_rate_limits.attempts < $3`, digest(b.key), b.seconds, b.limit)
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
	var a Account
	email, valid := normalizeEmail(email)
	if !valid {
		email = "invalid"
	}
	if err := s.rate(ctx, email); err != nil {
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
	matches := VerifyPassword(verifier, password)
	if !matches || err != nil || !valid || a.State != "active" {
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
		current, err := session(ctx, tx, replace)
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
	raw := token()
	if _, err = tx.Exec(ctx, `INSERT INTO sessions (account_id,token_digest) VALUES ($1,$2)`, a.ID, digest(raw)); err != nil {
		return "", err
	}
	return raw, tx.Commit(ctx)
}

func (s *Service) Logout(ctx context.Context, raw string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE token_digest=$1`, digest(raw))
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
        JOIN sessions other ON other.account_id=a.id WHERE own.token_digest=$1 ORDER BY other.created_at,other.id`, digest(raw))
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

func recent(s Session) error {
	if time.Since(s.VerifiedAt) > 5*time.Minute {
		return ErrRecent
	}
	return nil
}

// An empty sessionID revokes all sessions of the subject, including the actor's
// current one if it belongs to that account. Cross-account IDs never act as own.
func (s *Service) Revoke(ctx context.Context, raw, subject, sessionID string) error {
	tx, err := beginMutation(ctx, s.pool)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	actor, err := session(ctx, tx, raw)
	if err != nil {
		return err
	}
	if err = recent(actor); err != nil {
		return err
	}
	if actor.Account.ID != subject {
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
	actor, err := session(ctx, tx, raw)
	if err != nil {
		return err
	}
	if err = recent(actor); err != nil {
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
	if _, err = tx.Exec(ctx, `UPDATE accounts SET role=$2,state=$3 WHERE id=$1`, subject, role, state); err != nil {
		if pgErrCode(err) == "23514" {
			return ErrConflict
		}
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
