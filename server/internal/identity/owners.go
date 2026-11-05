package identity

import (
	"context"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
)

var (
	errLastOwner = errors.New("last project owner")
	errHostOwner = errors.New("owner is the project host")
)

type projectOwner struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Host  bool   `json:"host"`
}

func (a fileAccess) projectOwners(ctx context.Context, project string) ([]projectOwner, error) {
	if err := a.requireProjectOwner(ctx, project); err != nil {
		return nil, err
	}
	rows, err := a.tx.Query(ctx, `SELECT a.id,a.email,p.host_id=a.id
 FROM project_owners o JOIN hosted_projects p ON p.id=o.project_id
 JOIN accounts a ON a.id=o.account_id WHERE o.project_id=$1
 ORDER BY (p.host_id=a.id) DESC,a.email`, project)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[projectOwner])
}

func (a fileAccess) removeProjectOwner(ctx context.Context, project, owner string) error {
	if err := a.requireProjectOwner(ctx, project); err != nil {
		return err
	}
	var host bool
	var count int
	err := a.tx.QueryRow(ctx, `SELECT p.host_id=$2,
 (SELECT count(*) FROM project_owners WHERE project_id=$1)
 FROM hosted_projects p JOIN project_owners o ON o.project_id=p.id
 WHERE p.id=$1 AND o.account_id=$2`, project, owner).Scan(&host, &count)
	if errors.Is(err, pgx.ErrNoRows) {
		return errFileMissing
	}
	if err != nil {
		return err
	}
	if count <= 1 {
		return errLastOwner
	}
	if host {
		return errHostOwner
	}
	if _, err := a.tx.Exec(ctx, `DELETE FROM project_owners WHERE project_id=$1 AND account_id=$2`, project, owner); err != nil {
		return err
	}
	var invitation string
	err = a.tx.QueryRow(ctx, `UPDATE project_invitations SET state='revoked'
 WHERE project_id=$1 AND recipient_id=$2 AND co_owner AND state='active' RETURNING id`, project, owner).Scan(&invitation)
	if errors.Is(err, pgx.ErrNoRows) {
		_, err = a.tx.Exec(ctx, `UPDATE hosted_projects SET sync_epoch=gen_random_uuid() WHERE id=$1`, project)
		return err
	}
	if err != nil {
		return err
	}
	return a.dropInvitationGrant(ctx, project, invitation)
}

func (h *HTTP) ownerRoutes(route func(string, bool, http.HandlerFunc)) {
	const path = "/api/v1/hosted-projects/{project}/owners"
	route("GET "+path, true, func(w http.ResponseWriter, r *http.Request) {
		project := r.PathValue("project")
		if !uuid(project) {
			failure(w, ErrInvalid)
			return
		}
		var owners []projectOwner
		var transfer *hostingTransfer
		err := h.service.withFiles(r.Context(), h.raw(r), func(a fileAccess) error {
			var err error
			owners, err = a.projectOwners(r.Context(), project)
			if err != nil {
				return err
			}
			transfer, err = a.pendingHostingTransfer(r.Context(), project)
			return err
		})
		if err != nil {
			fileFailure(w, err)
			return
		}
		respond(w, http.StatusOK, map[string]any{"owners": owners, "hostingTransfer": transfer})
	})
	route("POST "+path+"/{owner}/remove", true, func(w http.ResponseWriter, r *http.Request) {
		var body struct{}
		if !decode(w, r, &body) {
			return
		}
		project, owner := r.PathValue("project"), r.PathValue("owner")
		if !uuid(project) || !uuid(owner) {
			failure(w, ErrInvalid)
			return
		}
		err := h.service.withFiles(r.Context(), h.raw(r), func(a fileAccess) error {
			return a.removeProjectOwner(r.Context(), project, owner)
		})
		switch {
		case errors.Is(err, errLastOwner):
			respond(w, 409, map[string]string{"error": "last_project_owner"})
		case errors.Is(err, errHostOwner):
			respond(w, 409, map[string]string{"error": "owner_is_project_host"})
		case err != nil:
			fileFailure(w, err)
		default:
			w.WriteHeader(http.StatusNoContent)
		}
	})
}
