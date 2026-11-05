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

func (a fileAccess) activateInvitation(ctx context.Context, project, id, recipientKey string, grant invitationGrant, files originalGrant) error {
	if err := a.requireProjectOwner(ctx, project); err != nil {
		return err
	}
	tag, err := a.tx.Exec(ctx, `WITH activated AS (
 UPDATE project_invitations i SET state='active'
 FROM accounts r JOIN sharing_identities k ON k.account_id=r.id
 WHERE i.id=$1 AND i.project_id=$2 AND i.state='accepted' AND r.id=i.recipient_id
 AND r.email=i.recipient_email AND r.state='active' AND k.public_key=$3
 AND (NOT i.co_owner OR $7='project-v1')
 AND EXISTS (SELECT 1 FROM sharing_identities WHERE account_id=$4)
 RETURNING i.id,i.recipient_id,i.co_owner
 ), owners AS (
 INSERT INTO project_owners(project_id,account_id)
 SELECT $2,recipient_id FROM activated WHERE co_owner
 )
 INSERT INTO invitation_grants(invitation_id,sender_id,encapsulation,ciphertext,format)
 SELECT id,$4,$5,$6,$7 FROM activated`, id, project, recipientKey, a.account, grant.Encapsulation, grant.Ciphertext, grant.Format)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return ErrConflict
	}
	return a.linkOriginals(ctx, project, id, files)
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
	change := func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			invitationGrant
			RecipientKey string `json:"recipientKey"`
			originalGrant
		}
		if !decodeBounded(w, r, &body, 96*1024) {
			return
		}
		maxBytes := 384
		switch body.Format {
		case "", "fixture-v1":
			body.Format = "fixture-v1"
			if len(body.FileIDs) > 0 {
				failure(w, ErrInvalid)
				return
			}
		case "project-v1":
			maxBytes = 64*1024 + 16
		default:
			failure(w, ErrInvalid)
			return
		}
		if len(body.FileIDs) > 64 {
			failure(w, ErrInvalid)
			return
		}
		if len(body.SourceIDs) > 64 || body.Epoch != "" && !uuid(body.Epoch) {
			failure(w, ErrInvalid)
			return
		}
		for _, file := range append(append([]string(nil), body.FileIDs...), body.SourceIDs...) {
			if !uuid(file) {
				failure(w, ErrInvalid)
				return
			}
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
			if r.Pattern == "POST /api/v1/hosted-projects/{project}/invitations/{invitation}/rotate-originals" {
				return a.rotateOriginals(r.Context(), project, id, body.RecipientKey, body.invitationGrant, body.originalGrant)
			}
			return a.activateInvitation(r.Context(), project, id, body.RecipientKey, body.invitationGrant, body.originalGrant)
		})
		if err != nil {
			fileFailure(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
	const invitation = "/api/v1/hosted-projects/{project}/invitations/{invitation}"
	route("POST "+invitation+"/activate", true, change)
	route("POST "+invitation+"/rotate-originals", true, change)
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
