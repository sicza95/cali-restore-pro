package identity

import (
	"context"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
)

type hostingTransfer struct {
	ID     string `json:"id"`
	FromID string `json:"fromId"`
	ToID   string `json:"toId"`
}

func (a fileAccess) pendingHostingTransfer(ctx context.Context, project string) (*hostingTransfer, error) {
	var transfer hostingTransfer
	err := a.tx.QueryRow(ctx, `SELECT id,from_id,to_id FROM hosting_transfers WHERE project_id=$1`, project).
		Scan(&transfer.ID, &transfer.FromID, &transfer.ToID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &transfer, err
}

func (a fileAccess) proposeHostingTransfer(ctx context.Context, project, to string) error {
	if err := a.requireProjectOwner(ctx, project); err != nil {
		return err
	}
	tag, err := a.tx.Exec(ctx, `INSERT INTO hosting_transfers(project_id,from_id,to_id)
 SELECT p.id,p.host_id,o.account_id FROM hosted_projects p
 JOIN project_owners o ON o.project_id=p.id
 JOIN accounts r ON r.id=o.account_id
 WHERE p.id=$1 AND p.host_id=$2 AND o.account_id=$3 AND o.account_id<>p.host_id AND r.state='active'
 ON CONFLICT(project_id) DO UPDATE SET id=excluded.id,from_id=excluded.from_id,to_id=excluded.to_id`, project, a.account, to)
	if err == nil && tag.RowsAffected() != 1 {
		return errFileMissing
	}
	return err
}

func (a fileAccess) acceptHostingTransfer(ctx context.Context, project, id string) error {
	if err := a.requireProjectOwner(ctx, project); err != nil {
		return err
	}
	var from string
	var charge int64
	err := a.tx.QueryRow(ctx, `SELECT t.from_id,
 (SELECT coalesce(sum(f.charged_bytes),0)::bigint FROM encrypted_files f WHERE f.project_id=p.id) +
 coalesce((SELECT octet_length(r.salt)+octet_length(r.ciphertext) FROM project_revision_heads r WHERE r.project_id=p.id),0)
 FROM hosting_transfers t JOIN hosted_projects p ON p.id=t.project_id
 WHERE p.id=$1 AND t.id=$2 AND t.to_id=$3 AND p.host_id=t.from_id`, project, id, a.account).
		Scan(&from, &charge)
	if errors.Is(err, pgx.ErrNoRows) {
		return errFileMissing
	}
	if err != nil {
		return err
	}
	if !a.hosting || a.quota == 0 {
		return ErrForbidden
	}
	used, err := a.usage(ctx)
	if err != nil {
		return err
	}
	if used+charge > a.quota {
		return errFileQuota
	}
	if _, err := a.tx.Exec(ctx, `UPDATE hosted_projects SET host_id=$2 WHERE id=$1 AND host_id=$3`, project, a.account, from); err != nil {
		return err
	}
	_, err = a.tx.Exec(ctx, `DELETE FROM hosting_transfers WHERE project_id=$1 AND id=$2`, project, id)
	return err
}

func (h *HTTP) hostingRoutes(route func(string, bool, http.HandlerFunc)) {
	const path = "/api/v1/hosted-projects/{project}/hosting-transfer"
	route("POST "+path, true, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			ToID string `json:"toId"`
		}
		if !decode(w, r, &body) {
			return
		}
		h.changeHosting(w, r, body.ToID, fileAccess.proposeHostingTransfer)
	})
	route("POST "+path+"/{transfer}/accept", true, func(w http.ResponseWriter, r *http.Request) {
		var body struct{}
		if !decode(w, r, &body) {
			return
		}
		h.changeHosting(w, r, r.PathValue("transfer"), fileAccess.acceptHostingTransfer)
	})
}

func (h *HTTP) changeHosting(w http.ResponseWriter, r *http.Request, id string, change func(fileAccess, context.Context, string, string) error) {
	project := r.PathValue("project")
	if !uuid(project) || !uuid(id) {
		failure(w, ErrInvalid)
		return
	}
	err := h.service.withFiles(r.Context(), h.raw(r), func(a fileAccess) error {
		return change(a, r.Context(), project, id)
	})
	if err != nil {
		fileFailure(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
