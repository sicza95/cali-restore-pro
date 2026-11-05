package identity

import (
	"context"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
)

type revisionKeyTransfer struct {
	revisionCiphertext
	Epoch     string `json:"epoch"`
	SyncEpoch string `json:"syncEpoch"`
	Recipient string `json:"recipient"`
}

func (a fileAccess) putRevisionKey(ctx context.Context, project, id string, key revisionKeyTransfer) error {
	if err := a.requireProjectOwner(ctx, project); err != nil {
		return err
	}
	result, err := a.tx.Exec(ctx, `INSERT INTO project_revision_key_transfers
 (project_id,recipient_id,sender_id,id,epoch,sync_epoch,expires_at,salt,ciphertext)
 SELECT p.id,o.account_id,$3,$2,h.epoch,p.sync_epoch,clock_timestamp()+interval '15 minutes',$7,$8
 FROM hosted_projects p JOIN project_revision_heads h ON h.project_id=p.id
 JOIN project_owners o ON o.project_id=p.id AND o.account_id=$4
 JOIN accounts r ON r.id=o.account_id AND r.state='active'
 WHERE p.id=$1 AND h.epoch=$5 AND p.sync_epoch=$6
 ON CONFLICT (project_id,recipient_id) DO UPDATE SET sender_id=excluded.sender_id,id=excluded.id,
 epoch=excluded.epoch,sync_epoch=excluded.sync_epoch,expires_at=excluded.expires_at,
 salt=excluded.salt,ciphertext=excluded.ciphertext`,
		project, id, a.account, key.Recipient, key.Epoch, key.SyncEpoch, key.Salt, key.Ciphertext)
	if err == nil && result.RowsAffected() == 0 {
		return errFileMissing
	}
	return err
}

func (a fileAccess) readRevisionKey(ctx context.Context, project, id string) (revisionKeyTransfer, error) {
	var key revisionKeyTransfer
	if err := a.requireProjectOwner(ctx, project); err != nil {
		return key, err
	}
	err := a.tx.QueryRow(ctx, `SELECT k.epoch,k.sync_epoch,k.recipient_id,k.salt,k.ciphertext
 FROM project_revision_key_transfers k
 JOIN hosted_projects p ON p.id=k.project_id AND p.sync_epoch=k.sync_epoch
 JOIN project_revision_heads h ON h.project_id=p.id AND h.epoch=k.epoch
 JOIN project_owners o ON o.project_id=p.id AND o.account_id=k.sender_id
 JOIN accounts s ON s.id=o.account_id AND s.state='active'
 WHERE k.project_id=$1 AND k.recipient_id=$2 AND k.id=$3 AND k.expires_at>clock_timestamp()`,
		project, a.account, id).Scan(&key.Epoch, &key.SyncEpoch, &key.Recipient, &key.Salt, &key.Ciphertext)
	if errors.Is(err, pgx.ErrNoRows) {
		return key, errFileMissing
	}
	return key, err
}

func (h *HTTP) revisionKeyRoutes(route func(string, bool, http.HandlerFunc)) {
	const path = "/api/v1/hosted-projects/{project}/revision-key/{transfer}"
	handle := func(w http.ResponseWriter, r *http.Request) {
		project, id, account := r.PathValue("project"), r.PathValue("transfer"), r.Header.Get("X-Sync-Account")
		if !uuid(project) || !uuid(id) || !uuid(account) {
			failure(w, ErrInvalid)
			return
		}
		var key revisionKeyTransfer
		write := r.Method == http.MethodPut
		if write {
			if !decodeBounded(w, r, &key, 1024) {
				return
			}
			if !uuid(key.Recipient) || !uuid(key.Epoch) || !uuid(key.SyncEpoch) ||
				len(key.Salt) != 32 || len(key.Ciphertext) != 82 {
				failure(w, ErrInvalid)
				return
			}
		}
		err := h.service.withFiles(r.Context(), h.raw(r), func(a fileAccess) error {
			if a.account != account {
				return ErrForbidden
			}
			if write {
				return a.putRevisionKey(r.Context(), project, id, key)
			}
			var err error
			key, err = a.readRevisionKey(r.Context(), project, id)
			return err
		})
		if err != nil {
			fileFailure(w, err)
		} else if write {
			w.WriteHeader(http.StatusNoContent)
		} else {
			respond(w, http.StatusOK, key)
		}
	}
	route("GET "+path, true, handle)
	route("PUT "+path, true, handle)
}
