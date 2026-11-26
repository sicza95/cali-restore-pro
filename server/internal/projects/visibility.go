package projects

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/sicza95/cali-restore-pro/server/internal/httpjson"
	"github.com/sicza95/cali-restore-pro/server/internal/identity"
	"github.com/sicza95/cali-restore-pro/server/internal/live"
)

var errVisibilityConflict = errors.New("project visibility conflict")

type projectVisibility struct {
	Visibility string `json:"visibility"`
	Version    int    `json:"version"`
	Name       string `json:"name"`
}

func (v projectVisibility) validWrite() bool {
	return (v.Visibility == "private" || v.Visibility == "listed") &&
		v.Version >= 1 && v.Version <= 2147483646 &&
		v.Name != "" && v.Name == strings.TrimSpace(v.Name) &&
		utf8.RuneCountInString(v.Name) <= 120 && !strings.ContainsRune(v.Name, '\x00')
}

// projectVisibility reads only explicitly published metadata, never the synced
// document. The owner guard serialises this operation with co-owner revocation
// and rejects deleted projects as well as projects this account does not own.
func (a fileAccess) projectVisibility(ctx context.Context, project string, next *projectVisibility) (projectVisibility, error) {
	var current projectVisibility
	if err := a.requireProjectOwner(ctx, project); err != nil {
		return current, err
	}
	var org string
	err := a.tx.QueryRow(ctx, `SELECT visibility,visibility_version,directory_name,organisation_id::text
 FROM hosted_projects WHERE id=$1`, project).Scan(&current.Visibility, &current.Version, &current.Name, &org)
	if err != nil || next == nil {
		return current, err
	}
	var updated projectVisibility
	err = a.tx.QueryRow(ctx, `UPDATE hosted_projects
 SET visibility=$2,visibility_version=visibility_version+1,directory_name=$3
 WHERE id=$1 AND visibility_version=$4
 RETURNING visibility,visibility_version,directory_name`, project, next.Visibility, next.Name, next.Version).
		Scan(&updated.Visibility, &updated.Version, &updated.Name)
	if errors.Is(err, pgx.ErrNoRows) {
		return current, errVisibilityConflict
	}
	if err != nil {
		return current, err
	}
	// Only a visible directory change needs to refresh other members' browsers.
	// pg_notify is transactional, so a failed write never emits a notice.
	if current.Visibility != updated.Visibility || current.Visibility == "listed" && current.Name != updated.Name {
		err = live.NotifyOrganisation(ctx, a.tx, org, a.account, "changed", "changed", live.Event{})
	}
	return updated, err
}

func (h *HTTP) visibilityRoutes(route func(string, bool, http.HandlerFunc)) {
	const path = "/api/v1/hosted-projects/{project}/visibility"
	handle := func(w http.ResponseWriter, r *http.Request) {
		project := r.PathValue("project")
		if !httpjson.UUID(project) {
			identity.Failure(w, identity.ErrInvalid)
			return
		}
		var next *projectVisibility
		if r.Method == http.MethodPatch {
			next = new(projectVisibility)
			if !httpjson.Decode(w, r, next) {
				return
			}
			if !next.validWrite() {
				identity.Failure(w, identity.ErrInvalid)
				return
			}
		}
		var result projectVisibility
		err := h.service.withFiles(r.Context(), h.raw(r), func(a fileAccess) error {
			var err error
			result, err = a.projectVisibility(r.Context(), project, next)
			return err
		})
		switch {
		case errors.Is(err, errVisibilityConflict):
			httpjson.Respond(w, http.StatusConflict, map[string]string{"error": "visibility_conflict"})
		case err != nil:
			fileFailure(w, err)
		default:
			httpjson.Respond(w, http.StatusOK, result)
		}
	}
	route("GET "+path, true, handle)
	route("PATCH "+path, true, handle)
}
