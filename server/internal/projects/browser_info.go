package projects

import (
	"net/http"

	"github.com/sicza95/cali-restore-pro/server/internal/httpjson"
	"github.com/sicza95/cali-restore-pro/server/internal/identity"
)

// Hosting removal is separate from trash: the host explicitly removes remote
// access while retaining their complete local project. Quota locks serialize it
// with transfers, revision writes, invitations and file uploads.
func (h *HTTP) browserInfoRoutes(route func(string, bool, http.HandlerFunc)) {
	const path = "/api/v1/hosted-projects/{project}"
	route("GET "+path+"/storage", true, func(w http.ResponseWriter, r *http.Request) {
		project := r.PathValue("project")
		if !httpjson.UUID(project) {
			identity.Failure(w, identity.ErrInvalid)
			return
		}
		var bytes int64
		err := h.service.withFiles(r.Context(), h.raw(r), func(a fileAccess) error {
			if err := a.requireProjectOwner(r.Context(), project); err != nil {
				return err
			}
			return a.tx.QueryRow(r.Context(), `SELECT
    (SELECT coalesce(sum(charged_bytes),0)::bigint FROM encrypted_files WHERE project_id=$1) +
    (SELECT coalesce(sum(octet_length(salt)+octet_length(ciphertext)),0)::bigint FROM project_revision_heads WHERE project_id=$1)`, project).Scan(&bytes)
		})
		if err != nil {
			fileFailure(w, err)
			return
		}
		httpjson.Respond(w, 200, map[string]int64{"bytes": bytes})
	})
	route("DELETE "+path+"/hosting", true, func(w http.ResponseWriter, r *http.Request) {
		project := r.PathValue("project")
		var body struct {
			Confirm bool `json:"confirm"`
		}
		if !httpjson.UUID(project) {
			identity.Failure(w, identity.ErrInvalid)
			return
		}
		if !httpjson.Decode(w, r, &body) {
			return
		}
		if !body.Confirm {
			identity.Failure(w, identity.ErrInvalid)
			return
		}
		err := h.service.withFileLock(r.Context(), h.raw(r), lifecycleWriteLock, func(a fileAccess) error {
			if err := a.hosts(r.Context(), project); err != nil {
				return err
			}
			if _, err := a.tx.Exec(r.Context(), `INSERT INTO hosting_removed_projects(id,host_id) VALUES($1,$2)`, project, a.account); err != nil {
				return err
			}
			if _, err := a.tx.Exec(r.Context(), `INSERT INTO hosting_removed_files(id)
    SELECT id FROM encrypted_files WHERE project_id=$1 ON CONFLICT DO NOTHING`, project); err != nil {
				return err
			}
			_, err := a.tx.Exec(r.Context(), `DELETE FROM hosted_projects WHERE id=$1`, project)
			return err
		})
		if err != nil {
			fileFailure(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}
