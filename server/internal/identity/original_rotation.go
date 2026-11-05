package identity

import (
	"context"
	"crypto/sha256"
	"fmt"
)

type originalGrant struct {
	FileIDs   []string `json:"fileIds"`
	SourceIDs []string `json:"sourceIds"`
	Epoch     string   `json:"originalEpoch"`
}

func versionedOriginalID(project, epoch, source string) string {
	h := sha256.Sum256([]byte("calirestore-original-epoch-v1:" + project + ":" + epoch + ":" + source))
	return fmt.Sprintf("%x-%x-%x-%x-%x", h[:4], h[4:6], h[6:8], h[8:10], h[10:16])
}

func (a fileAccess) dropInvitationGrant(ctx context.Context, project, invitation string) error {
	if _, err := a.tx.Exec(ctx, `UPDATE hosted_projects SET original_epoch=gen_random_uuid()
 WHERE id=$1 AND EXISTS (SELECT 1 FROM invitation_originals WHERE invitation_id=$2)`, project, invitation); err != nil {
		return err
	}
	if _, err := a.tx.Exec(ctx, `INSERT INTO retired_originals(file_id)
 SELECT file_id FROM invitation_originals WHERE invitation_id=$1 ON CONFLICT DO NOTHING`, invitation); err != nil {
		return err
	}
	_, err := a.tx.Exec(ctx, `DELETE FROM invitation_grants WHERE invitation_id=$1`, invitation)
	return err
}

func (a fileAccess) linkOriginals(ctx context.Context, project, id string, grant originalGrant) error {
	if len(grant.FileIDs) == 0 {
		if len(grant.SourceIDs) != 0 {
			return ErrInvalid
		}
		return nil
	}
	if err := a.hosts(ctx, project); err != nil {
		return err
	}
	var epoch string
	if err := a.tx.QueryRow(ctx, `SELECT coalesce(original_epoch::text,'') FROM hosted_projects WHERE id=$1`, project).Scan(&epoch); err != nil {
		return err
	}
	if grant.Epoch != epoch {
		return ErrConflict
	}
	sources := grant.SourceIDs
	if len(sources) == 0 && epoch == "" {
		sources = grant.FileIDs
	}
	if len(sources) != len(grant.FileIDs) {
		return ErrInvalid
	}
	for i, source := range sources {
		expected := source
		if epoch != "" {
			expected = versionedOriginalID(project, epoch, source)
		}
		if expected != grant.FileIDs[i] {
			return ErrConflict
		}
	}
	tag, err := a.tx.Exec(ctx, `INSERT INTO invitation_originals(invitation_id,file_id,source_id)
 SELECT $1,f.id,r.source::uuid FROM unnest($3::text[],$4::text[]) AS r(id,source)
 JOIN encrypted_files f ON f.id=r.id::uuid
 WHERE f.project_id=$2 AND f.state='committed'
 AND NOT EXISTS (SELECT 1 FROM retired_originals x WHERE x.file_id=f.id)
 ON CONFLICT DO NOTHING`, id, project, grant.FileIDs, sources)
	if err == nil && tag.RowsAffected() != int64(len(sources)) {
		return ErrConflict
	}
	return err
}

func (a fileAccess) rotateOriginals(ctx context.Context, project, id, recipientKey string, grant invitationGrant, files originalGrant) error {
	if err := a.requireProjectOwner(ctx, project); err != nil {
		return err
	}
	if grant.Format != "project-v1" || !uuid(files.Epoch) ||
		len(files.SourceIDs) == 0 || len(files.SourceIDs) != len(files.FileIDs) {
		return ErrInvalid
	}
	tag, err := a.tx.Exec(ctx, `UPDATE invitation_grants g SET encapsulation=$5,ciphertext=$6
 FROM project_invitations i JOIN accounts r ON r.id=i.recipient_id
 JOIN sharing_identities k ON k.account_id=i.recipient_id
 WHERE g.invitation_id=i.id AND i.id=$1 AND i.project_id=$2 AND i.state='active'
 AND r.state='active' AND r.email=i.recipient_email AND k.public_key=$3 AND g.sender_id=$4
 AND EXISTS (SELECT 1 FROM invitation_originals o JOIN retired_originals x ON x.file_id=o.file_id WHERE o.invitation_id=i.id)
 AND (SELECT array_agg(o.source_id::text ORDER BY o.source_id::text) FROM invitation_originals o WHERE o.invitation_id=i.id)
 = (SELECT array_agg(source ORDER BY source) FROM unnest($7::text[]) AS source)`,
		id, project, recipientKey, a.account, grant.Encapsulation, grant.Ciphertext, files.SourceIDs)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return ErrConflict
	}
	if _, err := a.tx.Exec(ctx, `DELETE FROM invitation_originals WHERE invitation_id=$1`, id); err != nil {
		return err
	}
	return a.linkOriginals(ctx, project, id, files)
}
