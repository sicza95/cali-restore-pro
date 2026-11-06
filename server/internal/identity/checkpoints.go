package identity

import (
	"context"
	"encoding/base64"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
)

type checkpointGrant struct {
	RecipientKey  string `json:"recipientKey"`
	Encapsulation string `json:"encapsulation"`
	Ciphertext    string `json:"ciphertext"`
}

const checkpointRecipient = ` FROM project_invitations i
 JOIN invitation_grants g ON g.invitation_id=i.id
 JOIN accounts r ON r.id=i.recipient_id
 JOIN sharing_identities k ON k.account_id=r.id
 WHERE i.id=$1 AND i.state='active' AND r.state='active' AND r.email=i.recipient_email
 AND` + grantReadGate

func checkpointFailure(w http.ResponseWriter, err error) {
	if errors.Is(err, pgx.ErrNoRows) {
		err = errFileMissing
	}
	fileFailure(w, err)
}

func (h *HTTP) checkpointRoutes(route func(string, bool, http.HandlerFunc)) {
	const owner = "/api/v1/hosted-projects/{project}/invitations/{invitation}/checkpoints"
	const recipient = "/api/v1/invitations/{invitation}/checkpoints"
	route("GET "+owner, true, h.listCheckpoints)
	route("GET "+recipient, true, h.listCheckpoints)
	route("GET "+recipient+"/{checkpoint}", true, h.openCheckpoint)
	route("PUT "+owner+"/{checkpoint}", true, h.changeCheckpoint)
	route("DELETE "+owner+"/{checkpoint}", true, h.changeCheckpoint)
}

func (h *HTTP) listCheckpoints(w http.ResponseWriter, r *http.Request) {
	project, id := r.PathValue("project"), r.PathValue("invitation")
	if !uuid(id) || (project != "" && !uuid(project)) {
		failure(w, ErrInvalid)
		return
	}
	ids := []string{}
	err := h.service.withFiles(r.Context(), h.raw(r), func(a fileAccess) error {
		ctx := r.Context()
		condition, value := " AND i.recipient_id=$2", a.account
		if project != "" {
			if err := a.requireProjectOwner(ctx, project); err != nil {
				return err
			}
			condition, value = " AND i.project_id=$2", project
		}
		// Authorize and collect the list in the same statement, including an empty list.
		return a.tx.QueryRow(ctx, `SELECT ARRAY(
 SELECT checkpoint_id::text FROM invitation_checkpoint_grants WHERE invitation_id=i.id ORDER BY checkpoint_id
 )`+checkpointRecipient+condition, id, value).Scan(&ids)
	})
	if err != nil {
		checkpointFailure(w, err)
		return
	}
	respond(w, http.StatusOK, map[string][]string{"checkpointIds": ids})
}

func (h *HTTP) openCheckpoint(w http.ResponseWriter, r *http.Request) {
	id, checkpoint := r.PathValue("invitation"), r.PathValue("checkpoint")
	if !uuid(id) || !uuid(checkpoint) {
		failure(w, ErrInvalid)
		return
	}
	grant := struct {
		CheckpointID  string `json:"checkpointId"`
		Encapsulation string `json:"encapsulation"`
		Ciphertext    string `json:"ciphertext"`
		SenderID      string `json:"senderId"`
		SenderKey     string `json:"senderKey"`
	}{CheckpointID: checkpoint}
	err := h.service.withFiles(r.Context(), h.raw(r), func(a fileAccess) error {
		return a.tx.QueryRow(r.Context(), `SELECT c.encapsulation,c.ciphertext,c.sender_id,s.public_key
 FROM invitation_checkpoint_grants c JOIN sharing_identities s ON s.account_id=c.sender_id
 WHERE c.invitation_id=(SELECT i.id`+checkpointRecipient+` AND i.recipient_id=$2) AND c.checkpoint_id=$3`,
			id, a.account, checkpoint).Scan(&grant.Encapsulation, &grant.Ciphertext, &grant.SenderID, &grant.SenderKey)
	})
	if err != nil {
		checkpointFailure(w, err)
		return
	}
	respond(w, http.StatusOK, grant)
}

func (h *HTTP) changeCheckpoint(w http.ResponseWriter, r *http.Request) {
	project, id, checkpoint := r.PathValue("project"), r.PathValue("invitation"), r.PathValue("checkpoint")
	if !uuid(project) || !uuid(id) || !uuid(checkpoint) {
		failure(w, ErrInvalid)
		return
	}
	var grant *checkpointGrant
	if r.Method == http.MethodPut {
		grant = &checkpointGrant{}
		if !decodeBounded(w, r, grant, 3*1024) {
			return
		}
		bytes, err := base64.StdEncoding.Strict().DecodeString(grant.Ciphertext)
		if !validSharingPoint(grant.RecipientKey) || !validSharingPoint(grant.Encapsulation) ||
			err != nil || len(bytes) < 16 || len(bytes) > 1536 || base64.StdEncoding.EncodeToString(bytes) != grant.Ciphertext {
			failure(w, ErrInvalid)
			return
		}
	}
	err := h.service.withFiles(r.Context(), h.raw(r), func(a fileAccess) error {
		return a.setCheckpoint(r.Context(), project, id, checkpoint, grant)
	})
	if err != nil {
		checkpointFailure(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a fileAccess) setCheckpoint(ctx context.Context, project, id, checkpoint string, grant *checkpointGrant) error {
	if err := a.requireProjectOwner(ctx, project); err != nil {
		return err
	}
	var recipientKey string
	if err := a.tx.QueryRow(ctx, "SELECT k.public_key"+checkpointRecipient+" AND i.project_id=$2", id, project).
		Scan(&recipientKey); err != nil {
		return err
	}
	if grant == nil {
		_, err := a.tx.Exec(ctx, `DELETE FROM invitation_checkpoint_grants WHERE invitation_id=$1 AND checkpoint_id=$2`, id, checkpoint)
		return err
	}
	if recipientKey != grant.RecipientKey {
		return ErrConflict
	}
	tag, err := a.tx.Exec(ctx, `INSERT INTO invitation_checkpoint_grants(invitation_id,checkpoint_id,sender_id,encapsulation,ciphertext)
 SELECT $1,$2,$3,$4,$5 WHERE (SELECT count(*) FROM invitation_checkpoint_grants WHERE invitation_id=$1)<64
 ON CONFLICT DO NOTHING`, id, checkpoint, a.account, grant.Encapsulation, grant.Ciphertext)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrConflict
	}
	return err
}
