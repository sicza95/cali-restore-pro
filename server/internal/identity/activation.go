package identity

import (
	"context"
	"crypto/ecdh"
	"encoding/base64"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
)

func validSharingPoint(text string) bool {
	b, err := base64.StdEncoding.Strict().DecodeString(text)
	if err != nil || len(b) != 65 || base64.StdEncoding.EncodeToString(b) != text {
		return false
	}
	_, err = ecdh.P256().NewPublicKey(b)
	return err == nil
}

type invitationGrant struct {
	Encapsulation string `json:"encapsulation"`
	Ciphertext    string `json:"ciphertext"`
	Format        string `json:"format,omitempty"`
}

func (a fileAccess) activateInvitation(ctx context.Context, project, id, recipientKey string, grant invitationGrant) error {
	if err := a.requireProjectOwner(ctx, project); err != nil {
		return err
	}
	tag, err := a.tx.Exec(ctx, `WITH activated AS (
 UPDATE project_invitations i SET state='active'
 FROM accounts r JOIN sharing_identities k ON k.account_id=r.id
 WHERE i.id=$1 AND i.project_id=$2 AND i.state='accepted' AND r.id=i.recipient_id
 AND r.email=i.recipient_email AND r.state='active' AND k.public_key=$3
 AND EXISTS (SELECT 1 FROM sharing_identities WHERE account_id=$4)
 RETURNING i.id
 )
 INSERT INTO invitation_grants(invitation_id,sender_id,encapsulation,ciphertext,format)
 SELECT id,$4,$5,$6,$7 FROM activated`, id, project, recipientKey, a.account, grant.Encapsulation, grant.Ciphertext, grant.Format)
	if err == nil && tag.RowsAffected() != 1 {
		return ErrConflict
	}
	return err
}

type receivedInvitation struct {
	invitationGrant
	SenderID  string `json:"senderId"`
	SenderKey string `json:"senderKey"`
}

func (h *HTTP) activationRoutes(route func(string, bool, http.HandlerFunc)) {
	route("POST /api/v1/sharing-identity", true, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			PublicKey string `json:"publicKey"`
		}
		if !decode(w, r, &body) {
			return
		}
		if !validSharingPoint(body.PublicKey) {
			failure(w, ErrInvalid)
			return
		}
		err := h.service.withFiles(r.Context(), h.raw(r), func(a fileAccess) error {
			ctx := r.Context()
			if _, err := a.tx.Exec(ctx, `INSERT INTO sharing_identities(account_id,public_key) VALUES($1,$2) ON CONFLICT DO NOTHING`, a.account, body.PublicKey); err != nil {
				return err
			}
			var key string
			err := a.tx.QueryRow(ctx, `SELECT public_key FROM sharing_identities WHERE account_id=$1`, a.account).Scan(&key)
			if err == nil && key != body.PublicKey {
				return ErrConflict
			}
			return err
		})
		if err != nil {
			failure(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	route("POST /api/v1/hosted-projects/{project}/invitations/{invitation}/activate", true, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			invitationGrant
			RecipientKey string `json:"recipientKey"`
		}
		if !decodeBounded(w, r, &body, 90*1024) {
			return
		}
		maxBytes := 384
		switch body.Format {
		case "", "fixture-v1":
			body.Format = "fixture-v1"
		case "project-v1":
			maxBytes = 64*1024 + 16
		default:
			failure(w, ErrInvalid)
			return
		}
		project, id := r.PathValue("project"), r.PathValue("invitation")
		ciphertext, err := base64.StdEncoding.Strict().DecodeString(body.Ciphertext)
		if !uuid(project) || !uuid(id) || !validSharingPoint(body.RecipientKey) ||
			!validSharingPoint(body.Encapsulation) || err != nil || len(ciphertext) < 16 ||
			len(ciphertext) > maxBytes || base64.StdEncoding.EncodeToString(ciphertext) != body.Ciphertext {
			failure(w, ErrInvalid)
			return
		}
		err = h.service.withFiles(r.Context(), h.raw(r), func(a fileAccess) error {
			return a.activateInvitation(r.Context(), project, id, body.RecipientKey, body.invitationGrant)
		})
		if err != nil {
			fileFailure(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	read := func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("invitation")
		if !uuid(id) {
			failure(w, ErrInvalid)
			return
		}
		var grant receivedInvitation
		err := h.service.withFiles(r.Context(), h.raw(r), func(a fileAccess) error {
			return a.tx.QueryRow(r.Context(), `SELECT g.encapsulation,g.ciphertext,g.sender_id,k.public_key,g.format
 FROM invitation_grants g JOIN project_invitations i ON i.id=g.invitation_id
 JOIN sharing_identities k ON k.account_id=g.sender_id JOIN accounts r ON r.id=i.recipient_id
 WHERE i.id=$1 AND i.recipient_id=$2 AND i.state='active' AND r.email=i.recipient_email
 AND (NOT $3 OR g.format='fixture-v1')`, id, a.account, r.Pattern == "GET /api/v1/invitations/{invitation}/fixture").
				Scan(&grant.Encapsulation, &grant.Ciphertext, &grant.SenderID, &grant.SenderKey, &grant.Format)
		})
		if errors.Is(err, pgx.ErrNoRows) {
			err = errFileMissing
		}
		if err != nil {
			fileFailure(w, err)
			return
		}
		respond(w, http.StatusOK, grant)
	}
	route("GET /api/v1/invitations/{invitation}/fixture", true, read)
	route("GET /api/v1/invitations/{invitation}/content", true, read)
}
