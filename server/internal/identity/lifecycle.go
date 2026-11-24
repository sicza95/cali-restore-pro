package identity

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/sicza95/cali-restore-pro/server/internal/identity/passhash"
	"github.com/sicza95/cali-restore-pro/server/internal/identity/sessiontoken"
	"github.com/sicza95/cali-restore-pro/server/internal/mailer"
)

var ErrLink = errors.New("invalid, expired or used link")

// ConfigureMail requires a stable operator key across API/worker restarts.
func (s *Service) ConfigureMail(key []byte, origin string) error {
	if len(key) != 32 {
		return errors.New("mail key must contain 32 bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return err
	}
	s.mailCipher, err = cipher.NewGCM(block)
	s.origin = strings.TrimRight(origin, "/")
	return err
}

func language(value string) string {
	if value == "hu" {
		return "hu"
	}
	return "en"
}

func (s *Service) hash(ctx context.Context, password string) (string, error) {
	select {
	case s.slots <- struct{}{}:
		defer func() { <-s.slots }()
	default:
		return "", ErrLimited
	}
	return passhash.Hash(password)
}

func (s *Service) Enqueue(ctx context.Context, tx pgx.Tx, account, to, lang, purpose, raw string, expiry time.Time) error {
	return s.enqueue(ctx, tx, account, to, lang, purpose, raw, "", expiry)
}

func (s *Service) enqueue(ctx context.Context, tx pgx.Tx, account, to, lang, purpose, raw, code string, expiry time.Time) error {
	if s.mailCipher == nil {
		return errors.New("mail not configured")
	}
	// Every email greets the account's full name once it has one.
	var name string
	if account != "" {
		err := tx.QueryRow(ctx, `SELECT full_name FROM accounts WHERE id=$1`, account).Scan(&name)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
	}
	plain, err := json.Marshal(mailer.Payload{To: to, Language: language(lang), Purpose: purpose, Token: raw, Code: code, Name: name})
	if err != nil {
		return err
	}
	nonce := make([]byte, s.mailCipher.NonceSize())
	_, _ = rand.Read(nonce)
	sealed := s.mailCipher.Seal(nonce, nonce, plain, []byte("calirestore-mail-v1"))
	// Admin lists these with the closest kind: a notice is a security notice,
	// and "not registered yet" is a sign-up code like any other.
	kind := map[string]string{"account-exists": "security", "not-registered": "verify", "password-reset": "security", "password-changed": "security"}[purpose]
	if kind == "" {
		kind = purpose
	}
	_, err = tx.Exec(ctx, `INSERT INTO mail_outbox(payload,expires_at,account_id,kind) VALUES($1,$2,$3,$4)`, sealed, expiry, account, kind)
	return err
}

func (s *Service) issue(ctx context.Context, tx pgx.Tx, id, to, lang, purpose string) error {
	return s.issueAs(ctx, tx, id, to, lang, purpose, purpose)
}

// issueAs stores a link for purpose and mails it with the wording of mail.
func (s *Service) issueAs(ctx context.Context, tx pgx.Tx, id, to, lang, purpose, mail string) error {
	// Reissue invalidates previous links without extending their validity.
	raw := sessiontoken.New()
	expiry := time.Now().Add(30 * time.Minute)
	// Sign-up and reset send a link and a six-digit code; both end together.
	var code string
	var digest []byte
	if purpose == "verify" || purpose == "reset" {
		expiry = time.Now().Add(codeExpiry)
		code = newCode()
		digest = codeDigest(id, code)
	}
	_, err := tx.Exec(ctx, `INSERT INTO identity_links(token_digest,account_id,purpose,target_email,expires_at,code_digest,code_attempts) VALUES($1,$2,$3,$4,$5,$6,0)
 ON CONFLICT(account_id,purpose) DO UPDATE SET token_digest=EXCLUDED.token_digest,target_email=EXCLUDED.target_email,expires_at=EXCLUDED.expires_at,code_digest=EXCLUDED.code_digest,code_attempts=0`, sessiontoken.Digest(raw), id, purpose, to, expiry, digest)
	if err != nil {
		return err
	}
	return s.enqueue(ctx, tx, id, to, lang, mail, raw, code, expiry)
}

// RegisterAccount starts an account from an email address alone. A new or still
// pending address gets a fresh link and code; an active account gets a notice
// instead. The answer is the same either way, so it reveals no account.
func (s *Service) RegisterAccount(ctx context.Context, email, lang string) error {
	return s.startByEmail(ctx, email, lang, false)
}

// ForgotPassword mails an active account a reset link and code. An address with
// no account, or one still pending, gets a sign-up link and code worded as
// "you don't have an account yet". Every address gets a code, so the page can
// ask for it straight away without revealing whether the account exists.
func (s *Service) ForgotPassword(ctx context.Context, email, lang string) error {
	return s.startByEmail(ctx, email, lang, true)
}

func (s *Service) startByEmail(ctx context.Context, email, lang string, forgot bool) error {
	email, valid := NormalizeEmail(email)
	if !valid {
		return ErrCredentials
	}
	if err := s.Rate(ctx, email); err != nil {
		return err
	}
	tx, err := beginMutation(ctx, s.pool)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	var id, state string
	err = tx.QueryRow(ctx, `SELECT id,state FROM accounts WHERE email=$1 FOR UPDATE`, email).Scan(&id, &state)
	if errors.Is(err, pgx.ErrNoRows) {
		// No password yet: an empty verifier never matches, so the account cannot sign in.
		err = tx.QueryRow(ctx, `INSERT INTO accounts(email,password_hash,language) VALUES($1,'',$2) ON CONFLICT(email) DO NOTHING RETURNING id`, email, language(lang)).Scan(&id)
		state = "pending_verification"
		if errors.Is(err, pgx.ErrNoRows) {
			return tx.Commit(ctx)
		}
	}
	if err != nil {
		return err
	}
	switch {
	case state == "pending_verification" && forgot:
		err = s.issueAs(ctx, tx, id, email, lang, "verify", "not-registered")
	case state == "pending_verification":
		err = s.issue(ctx, tx, id, email, lang, "verify")
	case state == "active" && forgot:
		err = s.issue(ctx, tx, id, email, lang, "reset")
	case state == "active":
		err = s.Enqueue(ctx, tx, id, email, lang, "account-exists", "", time.Now().Add(24*time.Hour))
	}
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ResendVerification sends a pending account a fresh sign-up link and code.
func (s *Service) ResendVerification(ctx context.Context, email, lang string) error {
	email, valid := NormalizeEmail(email)
	if !valid {
		return ErrCredentials
	}
	if err := s.Rate(ctx, email); err != nil {
		return err
	}
	tx, err := beginMutation(ctx, s.pool)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	var id, state string
	err = tx.QueryRow(ctx, `SELECT id,state FROM accounts WHERE email=$1 FOR UPDATE`, email).Scan(&id, &state)
	if errors.Is(err, pgx.ErrNoRows) {
		return tx.Commit(ctx)
	}
	if err != nil {
		return err
	}
	if state != "pending_verification" {
		return tx.Commit(ctx)
	}
	if err = s.issue(ctx, tx, id, email, lang, "verify"); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ConsumeLink finishes a link that needs no password: a new email address, or
// a verify link for an account that already has one. A reset finishes through
// CompleteCode, which sets the new password.
func (s *Service) ConsumeLink(ctx context.Context, raw, purpose string) error {
	if !sessiontoken.Valid(raw) {
		return ErrLink
	}
	if purpose != "verify" && purpose != "email" {
		return ErrLink
	}
	if err := s.Rate(ctx, "link:"+raw); err != nil {
		return err
	}
	tx, err := beginMutation(ctx, s.pool)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	var id, to, state, oldEmail, lang string
	err = tx.QueryRow(ctx, `SELECT l.account_id,l.target_email,a.state,a.email,a.language FROM identity_links l JOIN accounts a ON a.id=l.account_id
 WHERE l.token_digest=$1 AND l.purpose=$2 AND l.expires_at>clock_timestamp() FOR UPDATE OF a,l`, sessiontoken.Digest(raw), purpose).Scan(&id, &to, &state, &oldEmail, &lang)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrLink
	}
	if err != nil {
		return err
	}
	if purpose == "verify" && state != "pending_verification" || purpose != "verify" && state != "active" {
		return ErrLink
	}
	switch purpose {
	case "verify":
		// An account created by email alone has no password yet: it finishes through
		// CompleteSignup, which sets one, never through this link-only path.
		var result pgconn.CommandTag
		result, err = tx.Exec(ctx, `UPDATE accounts SET state='active' WHERE id=$1 AND password_hash<>''`, id)
		if err == nil && result.RowsAffected() == 0 {
			return ErrLink
		}
	case "email":
		_, err = tx.Exec(ctx, `UPDATE accounts SET email=$2 WHERE id=$1`, id, to)
	}
	if pgErrCode(err) == "23505" {
		return ErrLink
	}
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `DELETE FROM sessions WHERE account_id=$1`, id); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `DELETE FROM identity_links WHERE account_id=$1`, id); err != nil {
		return err
	}
	action := map[string]string{"verify": "account_verified", "email": "email_changed"}[purpose]
	if _, err = tx.Exec(ctx, `INSERT INTO identity_audit(actor_id,subject_id,action) VALUES($1,$1,$2)`, id, action); err != nil {
		return err
	}
	if purpose != "verify" {
		if err = s.Enqueue(ctx, tx, id, oldEmail, lang, "security", "", time.Now().Add(24*time.Hour)); err != nil {
			return err
		}
		if purpose == "email" {
			if err = s.Enqueue(ctx, tx, id, to, lang, "security", "", time.Now().Add(24*time.Hour)); err != nil {
				return err
			}
		}
	}
	return tx.Commit(ctx)
}

func (s *Service) ChangeCredential(ctx context.Context, raw, password, email string) error {
	if (password == "") == (email == "") {
		return ErrForbidden
	}
	current, err := s.Current(ctx, raw)
	if err != nil {
		return err
	}
	if err = RequireRecent(current); err != nil {
		return err
	}
	if err = s.Rate(ctx, current.Account.Email); err != nil {
		return err
	}
	// Confirmation is rotated by /auth/confirm before this action; validate it
	// again inside the serialized transaction to close revocation races.
	var verifier string
	if password != "" {
		if !passhash.Valid(password) {
			return ErrCredentials
		}
		verifier, err = s.hash(ctx, password)
		if err != nil {
			return err
		}
	}
	if email != "" {
		var valid bool
		email, valid = NormalizeEmail(email)
		if !valid {
			return ErrCredentials
		}
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
	var lang string
	if err = tx.QueryRow(ctx, `SELECT language FROM accounts WHERE id=$1 FOR UPDATE`, actor.Account.ID).Scan(&lang); err != nil {
		return err
	}
	if email != "" {
		// Same neutral result whether the requested address is available or occupied.
		var exists bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM accounts WHERE email=$1)`, email).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			if err = s.issue(ctx, tx, actor.Account.ID, email, lang, "email"); err != nil {
				return err
			}
		}
	} else {
		if _, err = tx.Exec(ctx, `UPDATE accounts SET password_hash=$2 WHERE id=$1`, actor.Account.ID, verifier); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `DELETE FROM sessions WHERE account_id=$1`, actor.Account.ID); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `DELETE FROM identity_links WHERE account_id=$1`, actor.Account.ID); err != nil {
			return err
		}
	}
	notice := "security"
	if password != "" {
		notice = "password-changed"
	}
	if err = s.Enqueue(ctx, tx, actor.Account.ID, actor.Account.Email, lang, notice, "", time.Now().Add(24*time.Hour)); err != nil {
		return err
	}
	action := "password_changed"
	if email != "" {
		action = "email_change_requested"
	}
	if _, err = tx.Exec(ctx, `INSERT INTO identity_audit(actor_id,subject_id,action) VALUES($1,$1,$2)`, actor.Account.ID, action); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
