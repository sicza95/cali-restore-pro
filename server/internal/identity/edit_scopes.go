package identity

import (
	"context"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
)

type scopeChange struct {
	Previous     invitationScope `json:"previous"`
	Next         invitationScope `json:"next"`
	RecipientKey string          `json:"recipientKey"`
	Grants       []scopeEnvelope `json:"grants"`
}

func (scope invitationScope) includes(name string) bool {
	return (name == "history" && scope.ShareHistory) || (name != "none" && name == scope.EstimateScope)
}

func (a fileAccess) insertNewScopes(ctx context.Context, id string, previous, next invitationScope, grants []scopeEnvelope) error {
	want := 0
	for _, name := range []string{next.EstimateScope, "history"} {
		if next.includes(name) && !previous.includes(name) {
			want++
		}
	}
	if len(grants) != want {
		return ErrConflict
	}
	for _, grant := range grants {
		if !next.includes(grant.Scope) || previous.includes(grant.Scope) {
			return ErrConflict
		}
		if _, err := a.tx.Exec(ctx, `INSERT INTO invitation_scope_grants(invitation_id,scope,sender_id,encapsulation,ciphertext)
 VALUES($1,$2,$3,$4,$5)`, id, grant.Scope, a.account, grant.Encapsulation, grant.Ciphertext); err != nil {
			return err
		}
	}
	return nil
}

func (a fileAccess) updateInvitationScopes(ctx context.Context, project, id string, change scopeChange) error {
	if err := a.requireProjectOwner(ctx, project); err != nil {
		return err
	}
	var previous invitationScope
	var recipientKey string
	err := a.tx.QueryRow(ctx, `SELECT i.estimate_scope,i.share_history,
 CASE WHEN r.state='active' AND r.email=i.recipient_email THEN coalesce(k.public_key,'') ELSE '' END
 FROM project_invitations i JOIN accounts r ON r.id=i.recipient_id
 LEFT JOIN sharing_identities k ON k.account_id=r.id
 WHERE i.id=$1 AND i.project_id=$2 AND i.state='active'`, id, project).
		Scan(&previous.EstimateScope, &previous.ShareHistory, &recipientKey)
	if errors.Is(err, pgx.ErrNoRows) {
		return errFileMissing
	}
	if err != nil {
		return err
	}
	if previous != change.Previous || len(change.Grants) > 0 && (recipientKey == "" || recipientKey != change.RecipientKey) {
		return ErrConflict
	}
	if err := a.insertNewScopes(ctx, id, previous, change.Next, change.Grants); err != nil {
		return err
	}
	if _, err := a.tx.Exec(ctx, `DELETE FROM invitation_scope_grants
 WHERE invitation_id=$1 AND scope<>$2 AND (scope<>'history' OR NOT $3)`,
		id, change.Next.EstimateScope, change.Next.ShareHistory); err != nil {
		return err
	}
	_, err = a.tx.Exec(ctx, `UPDATE project_invitations SET estimate_scope=$2,share_history=$3 WHERE id=$1`,
		id, change.Next.EstimateScope, change.Next.ShareHistory)
	return err
}

func (h *HTTP) changeInvitationScopes(w http.ResponseWriter, r *http.Request) {
	var body scopeChange
	if !decodeBounded(w, r, &body, 6*1024) {
		return
	}
	project, id := r.PathValue("project"), r.PathValue("invitation")
	if !uuid(project) || !uuid(id) || !body.Previous.valid() || !body.Next.valid() ||
		!validScopeEnvelopes(body.Grants) || len(body.Grants) > 0 && !validSharingPoint(body.RecipientKey) {
		failure(w, ErrInvalid)
		return
	}
	err := h.service.withFiles(r.Context(), h.raw(r), func(a fileAccess) error {
		return a.updateInvitationScopes(r.Context(), project, id, body)
	})
	if err != nil {
		fileFailure(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
