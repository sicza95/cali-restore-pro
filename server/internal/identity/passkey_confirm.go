package identity

import (
	"context"
	"errors"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/jackc/pgx/v5"
	"github.com/sicza95/cali-restore-pro/server/internal/identity/sessiontoken"
)

// ErrNoPasskeys means the account has no passkey to confirm with.
var ErrNoPasskeys = errors.New("no passkeys on this account")

// BeginPasskeyConfirm offers this account's own passkeys to confirm the
// signed-in person, as the password does, right before a security change.
func (s *Service) BeginPasskeyConfirm(ctx context.Context, raw string) (any, string, error) {
	if s.relyingParty == nil {
		return nil, "", ErrPasskeysUnavailable
	}
	current, err := s.Current(ctx, raw)
	if err != nil {
		return nil, "", err
	}
	if err = s.Rate(ctx, current.Account.Email); err != nil {
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
	user, err := loadPasskeyUser(ctx, tx, "id=$1", actor.Account.ID)
	if err != nil {
		return nil, "", err
	}
	if len(user.creds) == 0 {
		return nil, "", ErrNoPasskeys
	}
	assertion, data, err := s.relyingParty.BeginLogin(user, webauthn.WithUserVerification(protocol.VerificationRequired))
	if err != nil {
		return nil, "", err
	}
	if _, err = tx.Exec(ctx, `DELETE FROM passkey_ceremonies WHERE session_id=$1 OR expires_at<=clock_timestamp()`, actor.ID); err != nil {
		return nil, "", err
	}
	ceremony, err := s.storeCeremony(ctx, tx, "confirm", actor.ID, data)
	if err != nil {
		return nil, "", err
	}
	return assertion.Response, ceremony, tx.Commit(ctx)
}

// FinishPasskeyConfirm verifies the assertion against the signed-in account's
// passkeys and replaces the session with a freshly confirmed one, exactly as
// a password confirmation does.
func (s *Service) FinishPasskeyConfirm(ctx context.Context, raw, ceremony string, credential []byte) (string, error) {
	if s.relyingParty == nil {
		return "", ErrPasskeysUnavailable
	}
	current, err := s.Current(ctx, raw)
	if err != nil {
		return "", err
	}
	if err = s.Rate(ctx, current.Account.Email); err != nil {
		return "", err
	}
	data, err := s.takeCeremony(ctx, ceremony, "confirm", current.ID)
	if err != nil {
		return "", err
	}
	parsed, err := protocol.ParseCredentialRequestResponseBytes(credential)
	if err != nil {
		return "", ErrPasskey
	}
	tx, err := beginMutation(ctx, s.pool)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(context.Background())
	actor, err := LookupSession(ctx, tx, raw)
	if err != nil {
		return "", err
	}
	user, err := loadPasskeyUser(ctx, tx, "id=$1", actor.Account.ID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrUnauthorized
	}
	if err != nil {
		return "", err
	}
	used, err := s.relyingParty.ValidateLogin(user, data, parsed)
	if err != nil {
		return "", ErrPasskey
	}
	if used.Authenticator.CloneWarning {
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
	if _, err = tx.Exec(ctx, `DELETE FROM sessions WHERE id=$1`, actor.ID); err != nil {
		return "", err
	}
	fresh := sessiontoken.New()
	if _, err = tx.Exec(ctx, `INSERT INTO sessions (account_id,token_digest) VALUES ($1,$2)`, user.id, sessiontoken.Digest(fresh)); err != nil {
		return "", err
	}
	return fresh, tx.Commit(ctx)
}
