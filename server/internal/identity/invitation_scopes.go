package identity

import (
	"context"
	"encoding/base64"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
)

type scopeEnvelope struct {
	Scope         string `json:"scope"`
	Encapsulation string `json:"encapsulation"`
	Ciphertext    string `json:"ciphertext"`
}

func validOptionalScope(scope string) bool {
	return scope == "estimate-summary" || scope == "estimate-full" || scope == "history"
}

func validScopeEnvelopes(scopes []scopeEnvelope) bool {
	if len(scopes) > 2 {
		return false
	}
	seen := make(map[string]bool, len(scopes))
	for _, grant := range scopes {
		bytes, err := base64.StdEncoding.Strict().DecodeString(grant.Ciphertext)
		if !validOptionalScope(grant.Scope) || seen[grant.Scope] || !validSharingPoint(grant.Encapsulation) ||
			err != nil || len(bytes) < 16 || len(bytes) > 1536 ||
			base64.StdEncoding.EncodeToString(bytes) != grant.Ciphertext {
			return false
		}
		seen[grant.Scope] = true
	}
	return true
}

func (a fileAccess) linkScopes(ctx context.Context, id string, grants []scopeEnvelope) error {
	var scope invitationScope
	if err := a.tx.QueryRow(ctx, `SELECT estimate_scope,share_history FROM project_invitations WHERE id=$1`, id).
		Scan(&scope.EstimateScope, &scope.ShareHistory); err != nil {
		return err
	}
	return a.insertNewScopes(ctx, id, invitationScope{EstimateScope: "none"}, scope, grants)
}

func (h *HTTP) scopeRoutes(route func(string, bool, http.HandlerFunc)) {
	route("GET /api/v1/invitations/{invitation}/scopes/{scope}", true, func(w http.ResponseWriter, r *http.Request) {
		id, scope := r.PathValue("invitation"), r.PathValue("scope")
		if !uuid(id) || !validOptionalScope(scope) {
			failure(w, ErrInvalid)
			return
		}
		var grant struct {
			scopeEnvelope
			SenderID  string `json:"senderId"`
			SenderKey string `json:"senderKey"`
		}
		grant.Scope = scope
		err := h.service.withFiles(r.Context(), h.raw(r), func(a fileAccess) error {
			return a.tx.QueryRow(r.Context(), `SELECT s.encapsulation,s.ciphertext,s.sender_id,k.public_key
 FROM invitation_scope_grants s JOIN invitation_grants g ON g.invitation_id=s.invitation_id
 JOIN project_invitations i ON i.id=g.invitation_id JOIN accounts r ON r.id=i.recipient_id
 JOIN sharing_identities k ON k.account_id=s.sender_id
 WHERE i.id=$1 AND i.recipient_id=$2 AND i.state='active' AND r.email=i.recipient_email
 AND NOT EXISTS (SELECT 1 FROM project_deletions d WHERE d.id=i.project_id) AND s.scope=$3`,
				id, a.account, scope).Scan(&grant.Encapsulation, &grant.Ciphertext, &grant.SenderID, &grant.SenderKey)
		})
		if errors.Is(err, pgx.ErrNoRows) {
			err = errFileMissing
		}
		if err != nil {
			fileFailure(w, err)
			return
		}
		respond(w, http.StatusOK, grant)
	})
	route("POST /api/v1/hosted-projects/{project}/invitations/{invitation}/scopes", true, h.changeInvitationScopes)
}
