package identity

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type AdminAccount struct {
	Account
	Permissions    int  `json:"permissions"`
	ServerFeatures bool `json:"serverFeatures"`
	QuotaMiB       int  `json:"quotaMiB"`
	Sessions       int  `json:"sessions"`
}
type AuditEvent struct {
	Actor   string    `json:"actorId"`
	Subject string    `json:"subjectId"`
	Action  string    `json:"action"`
	At      time.Time `json:"at"`
}
type MailJob struct {
	ID       string    `json:"id"`
	Status   string    `json:"status"`
	Attempts int       `json:"attempts"`
	At       time.Time `json:"at"`
}

type AdminOperations struct {
	Jobs  []MailJob      `json:"jobs"`
	Audit []AuditEvent   `json:"audit"`
	Mail  map[string]int `json:"mail"`
}

const pageSize = 20

func (s *Service) AdminAccounts(ctx context.Context, raw, prefix, after string) ([]AdminAccount, error) {
	if len(prefix) > 254 || strings.ContainsRune(prefix, 0) || (after != "" && !uuid(after)) {
		return nil, ErrInvalid
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	actor, err := session(ctx, tx, raw)
	if err != nil {
		return nil, err
	}
	if !actor.Account.Allows(ViewAccounts) {
		return nil, ErrForbidden
	}
	rows, err := tx.Query(ctx, `SELECT a.id,a.email,a.state,a.role,a.admin_permissions,a.server_features,a.quota_mib,
    (SELECT count(*) FROM sessions WHERE account_id=a.id)
    FROM accounts a WHERE ($1 OR a.role='member') AND a.email LIKE $2 ESCAPE '!'
    AND a.id > COALESCE(NULLIF($3,'')::uuid,'00000000-0000-0000-0000-000000000000')
    ORDER BY a.id LIMIT $4`, actor.Account.Role == "superuser", strings.NewReplacer("!", "!!", "%", "!%", "_", "!_").Replace(strings.ToLower(strings.TrimSpace(prefix)))+"%", after, pageSize+1)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (AdminAccount, error) {
		var a AdminAccount
		err := row.Scan(&a.ID, &a.Email, &a.State, &a.Role, &a.Permissions, &a.ServerFeatures, &a.QuotaMiB, &a.Sessions)
		return a, err
	})
}

func (s *Service) Operations(ctx context.Context, raw string) (AdminOperations, error) {
	result := AdminOperations{Mail: map[string]int{"pending": 0, "sent": 0, "failed": 0}}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return result, err
	}
	defer tx.Rollback(context.Background())
	actor, err := session(ctx, tx, raw)
	if err != nil {
		return result, err
	}
	if !actor.Account.Allows(ViewOperations) {
		return result, ErrForbidden
	}
	rows, err := tx.Query(ctx, `SELECT actor_id,subject_id,action,created_at FROM identity_audit ORDER BY id DESC LIMIT 25`)
	if err != nil {
		return result, err
	}
	result.Audit, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (AuditEvent, error) {
		var a AuditEvent
		err := row.Scan(&a.Actor, &a.Subject, &a.Action, &a.At)
		return a, err
	})
	if err != nil {
		return result, err
	}
	rows, err = tx.Query(ctx, `SELECT status,count(*) FROM mail_outbox GROUP BY status`)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var status string
		var count int
		if err = rows.Scan(&status, &count); err != nil {
			return result, err
		}
		result.Mail[status] = count
	}
	if err = rows.Err(); err != nil {
		return result, err
	}
	rows, err = tx.Query(ctx, `SELECT id,status,attempts,created_at FROM mail_outbox ORDER BY created_at DESC,id DESC LIMIT 20`)
	if err != nil {
		return result, err
	}
	result.Jobs, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (MailJob, error) {
		var job MailJob
		err := row.Scan(&job.ID, &job.Status, &job.Attempts, &job.At)
		return job, err
	})
	return result, err
}

type Entitlement struct {
	ServerFeatures bool `json:"serverFeatures"`
	QuotaMiB       int  `json:"quotaMiB"`
}

func (s *Service) SetAdminControls(ctx context.Context, raw, subject string, entitlement *Entitlement, permissions *int) error {
	if (entitlement == nil) == (permissions == nil) {
		return ErrInvalid
	}
	if entitlement != nil && (entitlement.QuotaMiB < 0 || entitlement.QuotaMiB > 1048576) {
		return ErrInvalid
	}
	if permissions != nil && (*permissions < 0 || *permissions > 7) {
		return ErrInvalid
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
	required := ManageEntitlements
	if permissions != nil {
		required = ManageRoles
	}
	if !actor.Account.Allows(required) {
		return ErrForbidden
	}
	if err = recent(actor); err != nil {
		return err
	}
	var role, state string
	var old Entitlement
	var oldPermissions int
	err = tx.QueryRow(ctx, `SELECT role,state,server_features,quota_mib,admin_permissions FROM accounts WHERE id=$1 FOR UPDATE`, subject).
		Scan(&role, &state, &old.ServerFeatures, &old.QuotaMiB, &oldPermissions)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrForbidden
	}
	if err != nil {
		return err
	}
	if actor.Account.Role != "superuser" && role != "member" {
		return ErrForbidden
	}
	if state != "active" && state != "suspended" {
		return ErrConflict
	}
	action := "entitlements_changed"
	if entitlement != nil {
		if old == *entitlement {
			return nil
		}
		_, err = tx.Exec(ctx, `UPDATE accounts SET server_features=$2,quota_mib=$3 WHERE id=$1`, subject, entitlement.ServerFeatures, entitlement.QuotaMiB)
	} else {
		if role != "administrator" {
			return ErrConflict
		}
		if oldPermissions == *permissions {
			return nil
		}
		action = "delegation_changed"
		_, err = tx.Exec(ctx, `UPDATE accounts SET admin_permissions=$2 WHERE id=$1`, subject, *permissions)
		if err == nil {
			_, err = tx.Exec(ctx, `DELETE FROM sessions WHERE account_id=$1`, subject)
		}
		if err == nil {
			_, err = tx.Exec(ctx, `DELETE FROM identity_links WHERE account_id=$1`, subject)
		}
	}
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO identity_audit(actor_id,subject_id,action) VALUES ($1,$2,$3)`, actor.Account.ID, subject, action); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
