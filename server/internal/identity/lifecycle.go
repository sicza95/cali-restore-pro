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
	return HashPassword(password)
}

type mailPayload struct{ To, Language, Purpose, Token string }

func (s *Service) enqueue(ctx context.Context, tx pgx.Tx, account, to, lang, purpose, raw string, expiry time.Time) error {
	if s.mailCipher == nil {
		return errors.New("mail not configured")
	}
	plain, err := json.Marshal(mailPayload{to, language(lang), purpose, raw})
	if err != nil {
		return err
	}
	nonce := make([]byte, s.mailCipher.NonceSize())
	_, _ = rand.Read(nonce)
	sealed := s.mailCipher.Seal(nonce, nonce, plain, []byte("calirestore-mail-v1"))
	_, err = tx.Exec(ctx, `INSERT INTO mail_outbox(payload,expires_at,account_id) VALUES($1,$2,$3)`, sealed, expiry, account)
	return err
}

func (s *Service) issue(ctx context.Context, tx pgx.Tx, id, to, lang, purpose string) error {
	// Reissue invalidates previous links without extending their validity.
	raw := token()
	expiry := time.Now().Add(30 * time.Minute)
	if purpose == "verify" {
		expiry = time.Now().Add(24 * time.Hour)
	}
	_, err := tx.Exec(ctx, `INSERT INTO identity_links(token_digest,account_id,purpose,target_email,expires_at) VALUES($1,$2,$3,$4,$5)
 ON CONFLICT(account_id,purpose) DO UPDATE SET token_digest=EXCLUDED.token_digest,target_email=EXCLUDED.target_email,expires_at=EXCLUDED.expires_at`, digest(raw), id, purpose, to, expiry)
	if err != nil {
		return err
	}
	return s.enqueue(ctx, tx, id, to, lang, purpose, raw, expiry)
}

func (s *Service) RegisterAccount(ctx context.Context, email, password, lang string) error {
	email, valid := normalizeEmail(email)
	if !valid || !validPassword(password) {
		return ErrCredentials
	}
	if err := s.rate(ctx, email); err != nil {
		return err
	}
	verifier, err := s.hash(ctx, password)
	if err != nil {
		return err
	}
	tx, err := beginMutation(ctx, s.pool)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	var id string
	err = tx.QueryRow(ctx, `INSERT INTO accounts(email,password_hash,language) VALUES($1,$2,$3) ON CONFLICT(email) DO NOTHING RETURNING id`, email, verifier, language(lang)).Scan(&id)
	// Never replace another person's pending password or reveal an existing account.
	if errors.Is(err, pgx.ErrNoRows) {
		return tx.Commit(ctx)
	}
	if err != nil {
		return err
	}
	if err = s.issue(ctx, tx, id, email, lang, "verify"); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Service) RequestLink(ctx context.Context, email, lang, purpose string) error {
	email, valid := normalizeEmail(email)
	if !valid {
		return ErrCredentials
	}
	if purpose != "verify" && purpose != "reset" {
		return ErrForbidden
	}
	if err := s.rate(ctx, email); err != nil {
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
	if purpose == "verify" && state != "pending_verification" || purpose == "reset" && state != "active" {
		return tx.Commit(ctx)
	}
	if err = s.issue(ctx, tx, id, email, lang, purpose); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Service) ConsumeLink(ctx context.Context, raw, purpose, password string) error {
	if !validToken(raw) {
		return ErrLink
	}
	if purpose != "verify" && purpose != "reset" && purpose != "email" {
		return ErrLink
	}
	if err := s.rate(ctx, "link:"+raw); err != nil {
		return err
	}
	var verifier string
	var err error
	if purpose == "reset" {
		if !validPassword(password) {
			return ErrCredentials
		}
		verifier, err = s.hash(ctx, password)
		if err != nil {
			return err
		}
	}
	tx, err := beginMutation(ctx, s.pool)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	var id, to, state, oldEmail, lang string
	err = tx.QueryRow(ctx, `SELECT l.account_id,l.target_email,a.state,a.email,a.language FROM identity_links l JOIN accounts a ON a.id=l.account_id
 WHERE l.token_digest=$1 AND l.purpose=$2 AND l.expires_at>clock_timestamp() FOR UPDATE OF a,l`, digest(raw), purpose).Scan(&id, &to, &state, &oldEmail, &lang)
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
		_, err = tx.Exec(ctx, `UPDATE accounts SET state='active' WHERE id=$1`, id)
	case "reset":
		_, err = tx.Exec(ctx, `UPDATE accounts SET password_hash=$2 WHERE id=$1`, id, verifier)
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
	action := map[string]string{"verify": "account_verified", "reset": "password_changed", "email": "email_changed"}[purpose]
	if _, err = tx.Exec(ctx, `INSERT INTO identity_audit(actor_id,subject_id,action) VALUES($1,$1,$2)`, id, action); err != nil {
		return err
	}
	if purpose != "verify" {
		if err = s.enqueue(ctx, tx, id, oldEmail, lang, "security", "", time.Now().Add(24*time.Hour)); err != nil {
			return err
		}
		if purpose == "email" {
			if err = s.enqueue(ctx, tx, id, to, lang, "security", "", time.Now().Add(24*time.Hour)); err != nil {
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
	if err = recent(current); err != nil {
		return err
	}
	if err = s.rate(ctx, current.Account.Email); err != nil {
		return err
	}
	// Confirmation is rotated by /auth/confirm before this action; validate it
	// again inside the serialized transaction to close revocation races.
	var verifier string
	if password != "" {
		if !validPassword(password) {
			return ErrCredentials
		}
		verifier, err = s.hash(ctx, password)
		if err != nil {
			return err
		}
	}
	if email != "" {
		var valid bool
		email, valid = normalizeEmail(email)
		if !valid {
			return ErrCredentials
		}
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
	if err = s.enqueue(ctx, tx, actor.Account.ID, actor.Account.Email, lang, "security", "", time.Now().Add(24*time.Hour)); err != nil {
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
