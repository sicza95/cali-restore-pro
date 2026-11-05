package identity

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

type pendingInvitation struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	ExpiresAt time.Time `json:"expiresAt"`
}

func (a fileAccess) pendingInvitations(ctx context.Context) ([]pendingInvitation, error) {
	rows, err := a.tx.Query(ctx, `SELECT i.id,i.project_id,i.expires_at
 FROM project_invitations i JOIN accounts r ON r.id=i.recipient_id
 WHERE i.recipient_id=$1 AND r.email=i.recipient_email AND i.state='pending'
 AND i.expires_at>clock_timestamp() ORDER BY i.expires_at,i.id LIMIT 100`, a.account)
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, pgx.RowToStructByPos[pendingInvitation])
	if list == nil {
		list = []pendingInvitation{}
	}
	return list, err
}

func (a fileAccess) requireProjectOwner(ctx context.Context, project string) error {
	var exists bool
	err := a.tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_owners WHERE project_id=$1 AND account_id=$2)`, project, a.account).Scan(&exists)
	if err == nil && !exists {
		return errFileMissing
	}
	return err
}

func (s *Service) invite(ctx context.Context, a fileAccess, project, email string) (string, error) {
	if err := a.requireProjectOwner(ctx, project); err != nil {
		return "", err
	}
	var id, lang string
	var expires time.Time
	err := a.tx.QueryRow(ctx, `INSERT INTO project_invitations (project_id,recipient_id,recipient_email)
 SELECT $1,r.id,r.email FROM accounts r
 WHERE r.email=$2 AND r.state='active' AND NOT EXISTS (
   SELECT 1 FROM project_owners o WHERE o.project_id=$1 AND o.account_id=r.id
 )
 ON CONFLICT (project_id,recipient_id) DO UPDATE
 SET id=excluded.id, recipient_email=excluded.recipient_email, expires_at=excluded.expires_at, state='pending'
 WHERE project_invitations.state='cancelled' OR (
   project_invitations.state='pending' AND project_invitations.expires_at<=clock_timestamp()
 )
 RETURNING id, expires_at, (SELECT language FROM accounts WHERE email=$2)`, project, email).Scan(&id, &expires, &lang)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrConflict
	}
	if err != nil {
		return "", err
	}
	return id, s.enqueue(ctx, a.tx, email, lang, "project-invitation", "", expires)
}

func (a fileAccess) acceptInvitation(ctx context.Context, id string) error {
	result, err := a.tx.Exec(ctx, `UPDATE project_invitations i SET state='accepted'
 FROM accounts r WHERE i.id=$1 AND i.recipient_id=$2 AND r.id=i.recipient_id
 AND r.email=i.recipient_email AND i.state='pending' AND i.expires_at>clock_timestamp()`, id, a.account)
	if err == nil && result.RowsAffected() == 0 {
		return ErrLink
	}
	return err
}

func (a fileAccess) cancelInvitation(ctx context.Context, project, id string) error {
	if err := a.requireProjectOwner(ctx, project); err != nil {
		return err
	}
	result, err := a.tx.Exec(ctx, `UPDATE project_invitations SET state='cancelled'
 WHERE id=$1 AND project_id=$2 AND state IN ('pending','accepted')`, id, project)
	if err == nil && result.RowsAffected() == 0 {
		return errFileMissing
	}
	return err
}

func (h *HTTP) invitationRoutes(route func(string, bool, http.HandlerFunc)) {
	const projectInvitations = "/api/v1/hosted-projects/{project}/invitations"
	route("GET /api/v1/invitations", true, func(w http.ResponseWriter, r *http.Request) {
		var list []pendingInvitation
		err := h.service.withFiles(r.Context(), h.raw(r), func(a fileAccess) error {
			var err error
			list, err = a.pendingInvitations(r.Context())
			return err
		})
		if err != nil {
			failure(w, err)
			return
		}
		respond(w, http.StatusOK, map[string]any{"invitations": list})
	})
	route("POST "+projectInvitations, true, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Email string `json:"email"`
		}
		if !decode(w, r, &body) {
			return
		}
		email, valid := normalizeEmail(body.Email)
		project := r.PathValue("project")
		if !valid || !uuid(project) {
			failure(w, ErrInvalid)
			return
		}
		actor, err := h.service.Current(r.Context(), h.raw(r))
		if err != nil {
			failure(w, err)
			return
		}
		if err := h.service.rate(r.Context(), "invitation:"+actor.Account.ID); err != nil {
			failure(w, err)
			return
		}
		var id string
		err = h.service.withFiles(r.Context(), h.raw(r), func(a fileAccess) error {
			var err error
			id, err = h.service.invite(r.Context(), a, project, email)
			return err
		})
		if err != nil {
			fileFailure(w, err)
			return
		}
		respond(w, http.StatusCreated, map[string]string{"id": id, "state": "pending"})
	})
	route("POST /api/v1/invitations/{invitation}/accept", true, func(w http.ResponseWriter, r *http.Request) {
		h.changeInvitation(w, r, func(a fileAccess, id string) error {
			return a.acceptInvitation(r.Context(), id)
		})
	})
	route("POST "+projectInvitations+"/{invitation}/cancel", true, func(w http.ResponseWriter, r *http.Request) {
		h.changeInvitation(w, r, func(a fileAccess, id string) error {
			project := r.PathValue("project")
			if !uuid(project) {
				return ErrInvalid
			}
			return a.cancelInvitation(r.Context(), project, id)
		})
	})
}

func (h *HTTP) changeInvitation(w http.ResponseWriter, r *http.Request, change func(fileAccess, string) error) {
	var body struct{}
	if !decode(w, r, &body) {
		return
	}
	id := r.PathValue("invitation")
	if !uuid(id) {
		failure(w, ErrInvalid)
		return
	}
	err := h.service.withFiles(r.Context(), h.raw(r), func(a fileAccess) error {
		return change(a, id)
	})
	if err != nil {
		fileFailure(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
