package identity

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/sicza95/cali-restore-pro/server/internal/identity/passhash"
	"github.com/sicza95/cali-restore-pro/server/internal/identity/sessiontoken"
)

// Create account and password reset both mail a link and a six-digit code that
// share one identity_links row and expire together. A pending account proves
// with a 'verify' row, an active one with a 'reset' row. Five wrong codes end
// the code (the link still works); the per-address rate limit bounds guessing.
const (
	codeExpiry   = 15 * time.Minute
	codeAttempts = 5
)

var codeShape = regexp.MustCompile(`^[0-9]{6}$`)

func newCode() string {
	n, _ := rand.Int(rand.Reader, big.NewInt(1_000_000))
	return fmt.Sprintf("%06d", n.Int64())
}

// The account id binds a digest to one account. Six digits are short, so the
// digest only keeps the code out of plain sight; expiry and attempts protect it.
func codeDigest(account, code string) []byte {
	return sessiontoken.Digest("signup-code:" + account + ":" + code)
}

// CodeProof is what the person has from the email: the link token, or the
// address with the code.
type CodeProof struct{ Email, Code, Token string }

var errWrongCode = errors.New("wrong code")

// provenAccount locks the account the proof points to and says which flow it
// finishes ("verify" or "reset"). A wrong code is counted in tx and reported as
// errWrongCode: commit tx, then answer ErrLink.
func provenAccount(ctx context.Context, tx pgx.Tx, proof CodeProof) (id, purpose string, err error) {
	const matching = `((l.purpose='verify' AND a.state='pending_verification') OR (l.purpose='reset' AND a.state='active')) AND l.expires_at>clock_timestamp()`
	if proof.Token != "" {
		if !sessiontoken.Valid(proof.Token) {
			return "", "", ErrLink
		}
		err = tx.QueryRow(ctx, `SELECT a.id,l.purpose FROM identity_links l JOIN accounts a ON a.id=l.account_id
 WHERE l.token_digest=$1 AND `+matching+` FOR UPDATE OF a,l`, sessiontoken.Digest(proof.Token)).Scan(&id, &purpose)
	} else {
		normalized, valid := NormalizeEmail(proof.Email)
		if !valid || !codeShape.MatchString(proof.Code) {
			return "", "", ErrLink
		}
		var digest []byte
		var attempts int
		err = tx.QueryRow(ctx, `SELECT a.id,l.purpose,l.code_digest,l.code_attempts FROM accounts a JOIN identity_links l ON l.account_id=a.id
 WHERE a.email=$1 AND `+matching+` FOR UPDATE OF a,l`, normalized).Scan(&id, &purpose, &digest, &attempts)
		if err == nil && (digest == nil || attempts >= codeAttempts) {
			return "", "", ErrLink
		}
		if err == nil && subtle.ConstantTimeCompare(digest, codeDigest(id, proof.Code)) != 1 {
			// The last allowed wrong entry also clears the code.
			_, err = tx.Exec(ctx, `UPDATE identity_links SET code_attempts=code_attempts+1,
 code_digest=CASE WHEN code_attempts+1>=$3 THEN NULL ELSE code_digest END WHERE account_id=$1 AND purpose=$2`, id, purpose, codeAttempts)
			if err != nil {
				return "", "", err
			}
			return "", "", errWrongCode
		}
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", ErrLink
	}
	return id, purpose, err
}

func (s *Service) rateCode(ctx context.Context, proof CodeProof) error {
	if proof.Token != "" {
		return s.Rate(ctx, "link:"+proof.Token)
	}
	email, valid := NormalizeEmail(proof.Email)
	if !valid {
		email = "invalid"
	}
	// Its own budget: entering a code never uses up the address's sign-in attempts.
	return s.Rate(ctx, "signup:"+email)
}

// CheckCode says whether the code or link is still good, without using it up,
// so the page can ask for the password straight after the last digit.
func (s *Service) CheckCode(ctx context.Context, proof CodeProof) error {
	if err := s.rateCode(ctx, proof); err != nil {
		return err
	}
	tx, err := beginMutation(ctx, s.pool)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	_, _, err = provenAccount(ctx, tx, proof)
	if errors.Is(err, errWrongCode) {
		if err = tx.Commit(ctx); err != nil {
			return err
		}
		return ErrLink
	}
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// CompleteCode sets the password and returns a new session token: the person is
// signed in. A pending account becomes active. A reset ends every other session
// and removes the passkeys, since a reset by email suggests the account may be
// compromised (owner decision 2026-11-18). Either way the link and code end.
func (s *Service) CompleteCode(ctx context.Context, proof CodeProof, password string) (string, error) {
	if !passhash.Valid(password) {
		return "", ErrCredentials
	}
	if err := s.rateCode(ctx, proof); err != nil {
		return "", err
	}
	verifier, err := s.hash(ctx, password)
	if err != nil {
		return "", err
	}
	tx, err := beginMutation(ctx, s.pool)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(context.Background())
	id, purpose, err := provenAccount(ctx, tx, proof)
	if errors.Is(err, errWrongCode) {
		if err = tx.Commit(ctx); err != nil {
			return "", err
		}
		return "", ErrLink
	}
	if err != nil {
		return "", err
	}
	if _, err = tx.Exec(ctx, `UPDATE accounts SET password_hash=$2,state='active' WHERE id=$1`, id, verifier); err != nil {
		return "", err
	}
	var email, lang string
	if err = tx.QueryRow(ctx, `SELECT email,language FROM accounts WHERE id=$1`, id).Scan(&email, &lang); err != nil {
		return "", err
	}
	// A new account gets a welcome; a reset gets a "password changed" notice.
	action, notice := "account_verified", "welcome"
	if purpose == "reset" {
		action, notice = "password_changed", "password-reset"
		for _, sql := range []string{`DELETE FROM sessions WHERE account_id=$1`, `DELETE FROM passkeys WHERE account_id=$1`} {
			if _, err = tx.Exec(ctx, sql, id); err != nil {
				return "", err
			}
		}
	}
	if err = s.Enqueue(ctx, tx, id, email, lang, notice, "", time.Now().Add(24*time.Hour)); err != nil {
		return "", err
	}
	if _, err = tx.Exec(ctx, `DELETE FROM identity_links WHERE account_id=$1`, id); err != nil {
		return "", err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO identity_audit(actor_id,subject_id,action) VALUES($1,$1,$2)`, id, action); err != nil {
		return "", err
	}
	raw := sessiontoken.New()
	if _, err = tx.Exec(ctx, `INSERT INTO sessions (account_id,token_digest) VALUES ($1,$2)`, id, sessiontoken.Digest(raw)); err != nil {
		return "", err
	}
	return raw, tx.Commit(ctx)
}
