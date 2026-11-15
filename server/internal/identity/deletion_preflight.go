package identity

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// DeletionPreflight reports why an account cannot be deleted yet, or "" when it can.
func DeletionPreflight(ctx context.Context, q interface {
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
	case !active || lastAdmin:
		return "account_state_blocks_deletion", nil
	case hosted || lastOwner:
		return "hosted_projects_require_continuity", nil
	default:
		return "", nil
	}
}
