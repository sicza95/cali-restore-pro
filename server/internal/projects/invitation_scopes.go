package projects

import (
	"context"
	"encoding/base64"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/sicza95/cali-restore-pro/server/internal/httpjson"
	"github.com/sicza95/cali-restore-pro/server/internal/identity"
)

type scopeEnvelope struct {
	Scope         string `json:"scope"`
	Encapsulation string `json:"encapsulation"`
	Ciphertext    string `json:"ciphertext"`
}

func validOptionalScope(scope string) bool {
	return scope == "estimate-summary" || scope == "estimate-full" || scope == "history"
}

// A scope grant seals one estimate scope; a full estimate carries the whole issued
// snapshot. Like the project snapshot, it may hold 64 KiB of plaintext (#88): the
// device keeps an estimate with its snapshots in 64 Ki characters, and the largest
// full scope measured within that seals to about 42 KB. Migration 0022 checks the
// same bound on the base64 text, and the client checks it before sending
// (scopeGrantMaxBytes in src/platform/projects/sharing-scopes.ts).
const (
	scopeGrantMaxBytes = 64*1024 + 16
	scopeGrantMaxChars = (scopeGrantMaxBytes + 2) / 3 * 4
	maxScopeGrants     = 2
)

// validSealed reports whether ciphertext is canonical base64 of 16 to limit bytes.
func validSealed(ciphertext string, limit int) bool {
	bytes, err := base64.StdEncoding.Strict().DecodeString(ciphertext)
	return err == nil && len(bytes) >= 16 && len(bytes) <= limit &&
		base64.StdEncoding.EncodeToString(bytes) == ciphertext
}

func validScopeEnvelopes(scopes []scopeEnvelope) bool {
	if len(scopes) > maxScopeGrants {
		return false
	}
	seen := make(map[string]bool, len(scopes))
	for _, grant := range scopes {
		if !validOptionalScope(grant.Scope) || seen[grant.Scope] || !validSharingPoint(grant.Encapsulation) ||
			!validSealed(grant.Ciphertext, scopeGrantMaxBytes) {
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
		if !httpjson.UUID(id) || !validOptionalScope(scope) {
			identity.Failure(w, identity.ErrInvalid)
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
 AND`+grantReadGate+` AND s.scope=$3`,
				id, a.account, scope).Scan(&grant.Encapsulation, &grant.Ciphertext, &grant.SenderID, &grant.SenderKey)
		})
		if errors.Is(err, pgx.ErrNoRows) {
			err = errFileMissing
		}
		if err != nil {
			fileFailure(w, err)
			return
		}
		httpjson.Respond(w, http.StatusOK, grant)
	})
	route("POST /api/v1/hosted-projects/{project}/invitations/{invitation}/scopes", true, h.changeInvitationScopes)
}
