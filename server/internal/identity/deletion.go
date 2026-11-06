package identity

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// The shared lock covers every hosted access transaction. Lifecycle transitions
// take it exclusively before taking any account or project lock.
const lifecycleReadLock = "SELECT pg_advisory_xact_lock_shared(702090)"
const lifecycleWriteLock = "SELECT pg_advisory_xact_lock(702090)"

type deletionStatus struct {
	ID              string    `json:"id"`
	RecoverUntil    time.Time `json:"recoverUntil"`
	BackupExpiresAt time.Time `json:"backupExpiresAt"`
}

func (a fileAccess) projectDeletion(ctx context.Context, project, action string) (result deletionStatus, err error) {
	// Trash membership is intentionally available here only.
	var host string
	err = a.tx.QueryRow(ctx, `SELECT p.host_id FROM hosted_projects p JOIN project_owners o ON o.project_id=p.id
 WHERE p.id=$1 AND o.account_id=$2`, project, a.account).Scan(&host)
	if errors.Is(err, pgx.ErrNoRows) {
		return result, errFileMissing
	}
	if err != nil {
		return result, err
	}
	if action == "recover" {
		var eligible bool
		var quota int64
		err := a.tx.QueryRow(ctx, `SELECT state='active' AND server_features,quota_mib::bigint*1048576 FROM accounts WHERE id=$1 FOR NO KEY UPDATE`, host).Scan(&eligible, &quota)
		if err != nil {
			return result, err
		}
		hostAccess := a
		hostAccess.account = host
		used, err := hostAccess.usage(ctx)
		if err != nil {
			return result, err
		}
		if !eligible || used > quota {
			return result, ErrConflict
		}
		tag, err := a.tx.Exec(ctx, `DELETE FROM project_deletions WHERE id=$1 AND recover_until>clock_timestamp() AND purged_at IS NULL`, project)
		if err == nil && tag.RowsAffected() == 0 {
			err = ErrConflict
		}
		return result, err
	}
	err = a.tx.QueryRow(ctx, `WITH ts AS (SELECT clock_timestamp() AS t)
 INSERT INTO project_deletions(id,deleted_at,recover_until)
 SELECT $1,t,t+CASE WHEN $2 THEN interval '0 hours' ELSE interval '720 hours' END FROM ts
 ON CONFLICT(id) DO UPDATE SET recover_until=CASE WHEN $2 THEN least(project_deletions.recover_until,excluded.recover_until)
 ELSE project_deletions.recover_until END
 RETURNING id,recover_until,deleted_at+interval '2160 hours'`, project, action == "purge").
		Scan(&result.ID, &result.RecoverUntil, &result.BackupExpiresAt)
	return result, err
}

func accountDeletionPreflight(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, id string) (string, error) {
	var hosted, lastOwner, active, lastAdmin bool
	err := q.QueryRow(ctx, `SELECT
 EXISTS(SELECT 1 FROM hosted_projects WHERE host_id=a.id),
 EXISTS(SELECT 1 FROM project_owners o WHERE o.account_id=a.id AND NOT EXISTS
  (SELECT 1 FROM project_owners other JOIN accounts r ON r.id=other.account_id
   WHERE other.project_id=o.project_id AND other.account_id<>a.id AND r.state='active')),
 a.state IN ('active','suspended'),
 a.state='active' AND a.role='superuser' AND (SELECT active_superusers<=1 FROM identity_guard)
 FROM accounts a WHERE a.id=$1`, id).Scan(&hosted, &lastOwner, &active, &lastAdmin)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return "", ErrInvalid
	case err != nil:
		return "", err
	case hosted || lastOwner:
		return "hosted_projects_require_continuity", nil
	case !active || lastAdmin:
		return "account_state_blocks_deletion", nil
	default:
		return "", nil
	}
}

func (a fileAccess) deleteAccount(ctx context.Context, id string, purge bool) (result deletionStatus, err error) {
	var state string
	if err := a.tx.QueryRow(ctx, `SELECT state FROM accounts WHERE id=$1 FOR UPDATE`, id).Scan(&state); err != nil {
		return result, err
	}
	if state == "pending_deletion" {
		err = a.tx.QueryRow(ctx, `UPDATE account_deletions SET recover_until=CASE WHEN $2 THEN least(recover_until,clock_timestamp()) ELSE recover_until END
 WHERE id=$1 AND purged_at IS NULL RETURNING id,recover_until,deleted_at+interval '2160 hours'`, id, purge).
			Scan(&result.ID, &result.RecoverUntil, &result.BackupExpiresAt)
		return result, err
	}
	if reason, err := accountDeletionPreflight(ctx, a.tx, id); err != nil {
		return result, err
	} else if reason != "" {
		return result, ErrConflict
	}
	projects, err := a.tx.Query(ctx, `SELECT project_id::text FROM project_owners WHERE account_id=$1 ORDER BY project_id`, id)
	if err != nil {
		return result, err
	}
	ids, err := pgx.CollectRows(projects, pgx.RowTo[string])
	if err != nil {
		return result, err
	}
	for _, project := range ids {
		if err := a.departProject(ctx, project, id); err != nil {
			return result, err
		}
	}
	invitations, err := a.tx.Query(ctx, `UPDATE project_invitations SET state='revoked'
 WHERE recipient_id=$1 AND state IN ('pending','accepted','active') RETURNING project_id::text,id::text`, id)
	if err != nil {
		return result, err
	}
	type grant struct{ Project, ID string }
	grants, err := pgx.CollectRows(invitations, pgx.RowToStructByPos[grant])
	if err != nil {
		return result, err
	}
	for _, grant := range grants {
		if err := a.dropInvitationGrant(ctx, grant.Project, grant.ID); err != nil {
			return result, err
		}
	}
	for _, sql := range []string{
		"UPDATE accounts SET state='pending_deletion' WHERE id=$1",
		"DELETE FROM sessions WHERE account_id=$1",
		"DELETE FROM identity_links WHERE account_id=$1",
		"DELETE FROM mail_outbox WHERE account_id=$1",
		"DELETE FROM project_revision_key_transfers WHERE sender_id=$1 OR recipient_id=$1",
	} {
		if _, err := a.tx.Exec(ctx, sql, id); err != nil {
			return result, err
		}
	}
	err = a.tx.QueryRow(ctx, `WITH ts AS (SELECT clock_timestamp() AS t)
 INSERT INTO account_deletions(id,deleted_at,recover_until,previous_state)
 SELECT $1,t,t+CASE WHEN $2 THEN interval '0 hours' ELSE interval '720 hours' END,$3 FROM ts
 RETURNING id,recover_until,deleted_at+interval '2160 hours'`, id, purge, state).
		Scan(&result.ID, &result.RecoverUntil, &result.BackupExpiresAt)
	return result, err
}
