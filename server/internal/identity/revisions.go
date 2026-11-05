package identity

import (
	"bytes"
	"context"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
)

var (
	errRevisionConflict = errors.New("project revision conflict")
	errRevisionEpoch    = errors.New("project revision epoch changed")
)

type revisionCiphertext struct {
	Salt       []byte `json:"salt"`
	Ciphertext []byte `json:"ciphertext"`
}

type revisionHead struct {
	revisionCiphertext
	Revision int    `json:"revision"`
	Epoch    string `json:"epoch"`
}

type revisionState struct {
	Epoch string        `json:"epoch"`
	Head  *revisionHead `json:"head"`
}

type revisionWrite struct {
	revisionCiphertext
	Expected *int   `json:"expected"`
	Epoch    string `json:"epoch"`
}

func (a fileAccess) projectRevision(ctx context.Context, project string, next *revisionWrite) (revisionState, error) {
	var state revisionState
	if err := a.requireProjectOwner(ctx, project); err != nil {
		return state, err
	}
	var host string
	if err := a.tx.QueryRow(ctx, `SELECT sync_epoch::text,host_id::text FROM hosted_projects WHERE id=$1`, project).Scan(&state.Epoch, &host); err != nil {
		return state, err
	}
	var head revisionHead
	err := a.tx.QueryRow(ctx, `SELECT revision,epoch::text,salt,ciphertext FROM project_revision_heads WHERE project_id=$1`, project).
		Scan(&head.Revision, &head.Epoch, &head.Salt, &head.Ciphertext)
	if err == nil {
		state.Head = &head
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return state, err
	}
	if next == nil {
		return state, nil
	}
	if next.Epoch != state.Epoch {
		return state, errRevisionEpoch
	}
	if err := a.checkOriginalPublication(ctx, project, ""); err != nil {
		return state, err
	}

	// Lock quota and feature state alongside file uploads. Co-owners can contend
	// with the host (who takes the account lock first), so never wait here.
	var enabled bool
	var quota int64
	if err := a.tx.QueryRow(ctx, `SELECT state='active' AND server_features,quota_mib::bigint*1048576
 FROM accounts WHERE id=$1 FOR NO KEY UPDATE NOWAIT`, host).Scan(&enabled, &quota); err != nil {
		return state, err
	}
	if !enabled {
		return state, ErrForbidden
	}
	expected := *next.Expected
	if head.Revision != expected {
		// A lost response can replay the identical sealed request. Only the
		// current head can acknowledge a replay, and only in its current epoch.
		if head.Revision == expected+1 && head.Epoch == next.Epoch &&
			bytes.Equal(head.Salt, next.Salt) && bytes.Equal(head.Ciphertext, next.Ciphertext) {
			return state, nil
		}
		return state, errRevisionConflict
	}
	hostAccess := a
	hostAccess.account = host
	used, err := hostAccess.usage(ctx)
	if err != nil {
		return state, err
	}
	if used-int64(len(head.Salt)+len(head.Ciphertext))+int64(len(next.Salt)+len(next.Ciphertext)) > quota {
		return state, errFileQuota
	}
	_, err = a.tx.Exec(ctx, `INSERT INTO project_revision_heads (project_id,revision,epoch,salt,ciphertext)
 VALUES ($1,$2,$3,$4,$5) ON CONFLICT (project_id) DO UPDATE
 SET revision=excluded.revision,epoch=excluded.epoch,salt=excluded.salt,ciphertext=excluded.ciphertext`,
		project, expected+1, next.Epoch, next.Salt, next.Ciphertext)
	state.Head = &revisionHead{revisionCiphertext: next.revisionCiphertext, Revision: expected + 1, Epoch: next.Epoch}
	return state, err
}

func (h *HTTP) revisionRoutes(route func(string, bool, http.HandlerFunc)) {
	const path = "/api/v1/hosted-projects/{project}/revision"
	handle := func(w http.ResponseWriter, r *http.Request) {
		project, account := r.PathValue("project"), r.Header.Get("X-Sync-Account")
		if !uuid(project) || !uuid(account) {
			failure(w, ErrInvalid)
			return
		}
		var next *revisionWrite
		if r.Method == http.MethodPut {
			next = new(revisionWrite)
			if !decodeBounded(w, r, next, 90*1024) {
				return
			}
			if next.Expected == nil || *next.Expected < 0 || *next.Expected >= 2147483647 ||
				!uuid(next.Epoch) || len(next.Salt) != 32 || len(next.Ciphertext) < 16 || len(next.Ciphertext) > 65552 {
				failure(w, ErrInvalid)
				return
			}
		}
		var state revisionState
		err := h.service.withFiles(r.Context(), h.raw(r), func(a fileAccess) error {
			if a.account != account {
				return ErrForbidden
			}
			var err error
			state, err = a.projectRevision(r.Context(), project, next)
			return err
		})
		switch {
		case errors.Is(err, errRevisionConflict):
			respond(w, 409, map[string]string{"error": "revision_conflict"})
		case errors.Is(err, errRevisionEpoch):
			respond(w, 409, map[string]string{"error": "revision_epoch_changed"})
		case err != nil:
			fileFailure(w, err)
		default:
			respond(w, 200, state)
		}
	}
	route("GET "+path, true, handle)
	route("PUT "+path, true, handle)
}
