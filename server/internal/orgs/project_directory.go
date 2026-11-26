package orgs

import (
	"context"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/sicza95/cali-restore-pro/server/internal/httpjson"
	"github.com/sicza95/cali-restore-pro/server/internal/identity"
)

type directoryOwner struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type directoryProject struct {
	ID     string           `json:"id"`
	Name   string           `json:"name"`
	Owners []directoryOwner `json:"owners"`
}

type projectDirectory struct {
	Projects []directoryProject `json:"projects"`
	Next     *string            `json:"next"`
}

// ProjectDirectory grants discovery only. Cards use owner-approved names and
// current owner profile names; neither documents nor emails enter this query.
func (s *Service) ProjectDirectory(ctx context.Context, raw, org, after string, limit int) (projectDirectory, error) {
	page := projectDirectory{Projects: []directoryProject{}}
	if !httpjson.UUID(org) {
		return page, identity.ErrInvalid
	}
	if after != "" && !httpjson.UUID(after) || limit < 1 || limit > 100 {
		return page, identity.ErrInvalid
	}
	var cursor *string
	if after != "" {
		cursor = &after
	}
	err := s.with(ctx, raw, func(a access) error {
		if _, _, err := a.role(ctx, org, false); err != nil {
			return err
		}
		rows, err := a.tx.Query(ctx, `SELECT p.id::text,p.directory_name,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id::text,'name',a.full_name) ORDER BY a.id)
 FROM project_owners o JOIN accounts a ON a.id=o.account_id WHERE o.project_id=p.id),'[]'::jsonb)
 FROM (SELECT id,directory_name FROM hosted_projects p
 WHERE organisation_id=$1 AND visibility='listed' AND ($2::uuid IS NULL OR id>$2)
 AND NOT EXISTS (SELECT 1 FROM project_deletions d WHERE d.id=p.id)
 ORDER BY id LIMIT $3) p ORDER BY p.id`, org, cursor, limit+1)
		if err != nil {
			return err
		}
		projects, err := pgx.CollectRows(rows, pgx.RowToStructByPos[directoryProject])
		if err != nil {
			return err
		}
		if len(projects) > limit {
			page.Next = &projects[limit-1].ID
			projects = projects[:limit]
		}
		if projects != nil {
			page.Projects = projects
		}
		return nil
	})
	return page, err
}

func (h *HTTP) projectDirectoryRoutes(route func(string, bool, http.HandlerFunc)) {
	route("GET /api/v1/organisations/{org}/projects", true, func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()
		limit := 50
		if values, present := query["limit"]; present {
			var err error
			limit, err = strconv.Atoi(query.Get("limit"))
			if err != nil || len(values) != 1 {
				failure(w, identity.ErrInvalid)
				return
			}
		}
		if values, present := query["after"]; present && (len(values) != 1 || !httpjson.UUID(query.Get("after"))) {
			failure(w, identity.ErrInvalid)
			return
		}
		page, err := h.service.ProjectDirectory(r.Context(), h.auth.Token(r), r.PathValue("org"), query.Get("after"), limit)
		reply(w, err, page)
	})
}
