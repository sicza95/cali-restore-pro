package identity

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

func pgErrCode(err error) string {
	var e *pgconn.PgError
	if errors.As(err, &e) {
		return e.Code
	}
	return ""
}

// Bootstrap is an operator command using the migrator credential, never an HTTP
// route. A sealed guard survives demotion and prevents creating a second initial
// superuser. Repeating the same account is a no-op, not a password reset.
func Bootstrap(ctx context.Context, pool *pgxpool.Pool, email, password string) error {
	email, ok := normalizeEmail(email)
	if !ok {
		return errors.New("invalid bootstrap email")
	}
	hash, err := HashPassword(password)
	if err != nil {
		return err
	}
	tx, err := beginMutation(ctx, pool)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	var previous string
	err = tx.QueryRow(ctx, `SELECT CASE WHEN g.bootstrap_account IS NULL THEN '' ELSE coalesce(a.email,'[purged]') END FROM identity_guard g LEFT JOIN accounts a ON a.id=g.bootstrap_account WHERE g.singleton FOR UPDATE OF g`).Scan(&previous)
	if err != nil {
		return errors.New("bootstrap unavailable; use the migration role and current schema")
	}
	if previous != "" {
		if previous != email {
			return ErrConflict
		}
		return tx.Commit(ctx)
	}
	var id string
	if err = tx.QueryRow(ctx, `INSERT INTO accounts(email,password_hash,state,role) VALUES ($1,$2,'active','superuser') RETURNING id`, email, hash).Scan(&id); err != nil {
		return ErrConflict
	}
	if _, err = tx.Exec(ctx, `UPDATE identity_guard SET bootstrap_account=$1 WHERE singleton`, id); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO identity_audit(actor_id,subject_id,action) VALUES ($1,$1,'bootstrap')`, id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
