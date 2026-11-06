package identity

import (
	"context"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
)

func (s *Service) recoverAccount(ctx context.Context, email, password string) error {
	account, verifier, err := s.checkPasswordState(ctx, email, password, "pending_deletion")
	if err != nil {
		return err
	}
	tx, err := beginMutation(ctx, s.pool)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	var hash string
	err = tx.QueryRow(ctx, `SELECT password_hash FROM accounts WHERE id=$1 AND state='pending_deletion' FOR UPDATE`, account.ID).Scan(&hash)
	if errors.Is(err, pgx.ErrNoRows) || err == nil && hash != verifier {
		return ErrCredentials
	}
	if err != nil {
		return err
	}
	var state string
	err = tx.QueryRow(ctx, `DELETE FROM account_deletions WHERE id=$1 AND recover_until>clock_timestamp()
 AND purged_at IS NULL RETURNING previous_state`, account.ID).Scan(&state)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrCredentials
	}
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE accounts SET state=$2 WHERE id=$1`, account.ID, state); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (h *HTTP) deletionRoutes(route func(string, bool, http.HandlerFunc)) {
	route("POST /api/v1/auth/recover-deleted-account", false, func(w http.ResponseWriter, r *http.Request) {
		var body struct{ Email, Password string }
		if !decode(w, r, &body) {
			return
		}
		if err := h.service.recoverAccount(r.Context(), body.Email, body.Password); err != nil {
			failure(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	for _, path := range []string{"POST /api/v1/account/deletion", "POST /api/v1/admin/accounts/{id}/deletion"} {
		route(path, true, h.changeAccountDeletion)
	}
	route("GET /api/v1/hosted-project-trash", true, func(w http.ResponseWriter, r *http.Request) {
		list := []deletionStatus{}
		err := h.service.withFiles(r.Context(), h.raw(r), func(a fileAccess) error {
			rows, err := a.tx.Query(r.Context(), `SELECT d.id,d.recover_until,d.deleted_at+interval '2160 hours'
 FROM project_deletions d JOIN project_owners o ON o.project_id=d.id
 WHERE o.account_id=$1 ORDER BY d.recover_until,d.id`, a.account)
			if err != nil {
				return err
			}
			list, err = pgx.CollectRows(rows, pgx.RowToStructByPos[deletionStatus])
			return err
		})
		if err != nil {
			failure(w, err)
			return
		}
		if list == nil {
			list = []deletionStatus{}
		}
		respond(w, 200, list)
	})
	route("POST /api/v1/hosted-projects/{project}/deletion", true, h.changeProjectDeletion)
}

func (h *HTTP) changeAccountDeletion(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Confirm             bool `json:"confirm"`
		PendingWorkResolved bool `json:"pendingWorkResolved"`
		Purge               bool `json:"purge"`
	}
	if !decode(w, r, &body) {
		return
	}
	id := r.PathValue("id")
	if !body.Confirm || !body.PendingWorkResolved || id != "" && !uuid(id) {
		failure(w, ErrInvalid)
		return
	}
	var result deletionStatus
	err := h.service.withFileLock(r.Context(), h.raw(r), lifecycleWriteLock, func(a fileAccess) error {
		ctx := r.Context()
		actor, err := session(ctx, a.tx, h.raw(r))
		if err != nil {
			return err
		}
		if err := recent(actor); err != nil {
			return err
		}
		if id == "" {
			id = a.account
		} else if !actor.Account.Allows(ManageRoles) || id != a.account && actor.Account.Role != "superuser" {
			return ErrForbidden
		}
		result, err = a.deleteAccount(ctx, id, body.Purge)
		return err
	})
	if err != nil {
		failure(w, err)
		return
	}
	if r.PathValue("id") == "" {
		h.setCookie(w, "")
	}
	respond(w, 200, result)
}

func (h *HTTP) changeProjectDeletion(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Action  string `json:"action"`
		Confirm bool   `json:"confirm"`
	}
	if !decode(w, r, &body) {
		return
	}
	project := r.PathValue("project")
	if !uuid(project) || !body.Confirm || (body.Action != "delete" && body.Action != "purge" && body.Action != "recover") {
		failure(w, ErrInvalid)
		return
	}
	var result deletionStatus
	err := h.service.withFileLock(r.Context(), h.raw(r), lifecycleWriteLock, func(a fileAccess) error {
		var err error
		result, err = a.projectDeletion(r.Context(), project, body.Action)
		return err
	})
	if err != nil {
		fileFailure(w, err)
		return
	}
	if body.Action == "recover" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	respond(w, 200, result)
}
