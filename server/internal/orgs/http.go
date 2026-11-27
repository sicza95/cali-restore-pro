package orgs

import (
	"errors"
	"net/http"

	"github.com/sicza95/cali-restore-pro/server/internal/httpjson"
	"github.com/sicza95/cali-restore-pro/server/internal/identity"
)

type HTTP struct {
	auth    *identity.HTTP
	service *Service
}

func NewHTTP(auth *identity.HTTP, service *Service) *HTTP {
	return &HTTP{auth: auth, service: service}
}

func failure(w http.ResponseWriter, err error) {
	codes := []struct {
		err    error
		status int
		code   string
	}{
		{errNotFound, 404, "not_found"},
		{errLastAdmin, 409, "last_admin"},
		{errPersonal, 409, "personal_organisation"},
		{errHasProject, 409, "organisation_has_projects"},
		{errMember, 409, "already_member"},
		{errTooMany, 409, "limit_reached"},
	}
	for _, c := range codes {
		if errors.Is(err, c.err) {
			httpjson.Respond(w, c.status, map[string]string{"error": c.code})
			return
		}
	}
	identity.Failure(w, err)
}

func reply(w http.ResponseWriter, err error, value any) {
	if err != nil {
		failure(w, err)
		return
	}
	httpjson.Respond(w, 200, value)
}

var ok = map[string]bool{"ok": true}

// Register adds the organisation routes behind the identity Guard.
func (h *HTTP) Register(mux *http.ServeMux) {
	route := h.auth.Guard(mux)
	h.projectDirectoryRoutes(route)
	h.defaultsRoutes(route)
	token := h.auth.Token
	// ids checks the path's ids; a malformed one is an unknown organisation.
	ids := func(w http.ResponseWriter, r *http.Request, names ...string) ([]string, bool) {
		out := make([]string, len(names))
		for i, name := range names {
			out[i] = r.PathValue(name)
			if !httpjson.UUID(out[i]) {
				failure(w, errNotFound)
				return nil, false
			}
		}
		return out, true
	}
	const base = "/api/v1/organisations"
	route("GET "+base, true, func(w http.ResponseWriter, r *http.Request) {
		overview, err := h.service.Overview(r.Context(), token(r))
		reply(w, err, overview)
	})
	route("POST "+base, true, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Name     string `json:"name"`
			Language string `json:"language"`
		}
		if !httpjson.Decode(w, r, &body) {
			return
		}
		id, err := h.service.Create(r.Context(), token(r), body.Name, body.Language)
		reply(w, err, map[string]string{"id": id})
	})
	route("GET "+base+"/{org}", true, func(w http.ResponseWriter, r *http.Request) {
		if p, valid := ids(w, r, "org"); valid {
			detail, err := h.service.Detail(r.Context(), token(r), p[0])
			reply(w, err, detail)
		}
	})
	route("PATCH "+base+"/{org}", true, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Name string `json:"name"`
		}
		if p, valid := ids(w, r, "org"); valid && httpjson.Decode(w, r, &body) {
			reply(w, h.service.Rename(r.Context(), token(r), p[0], body.Name), ok)
		}
	})
	route("DELETE "+base+"/{org}", true, func(w http.ResponseWriter, r *http.Request) {
		if p, valid := ids(w, r, "org"); valid {
			reply(w, h.service.Delete(r.Context(), token(r), p[0]), ok)
		}
	})
	route("POST "+base+"/{org}/invitations", true, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Email  string   `json:"email"`
			Role   string   `json:"role"`
			Groups []string `json:"groups"`
		}
		if p, valid := ids(w, r, "org"); valid && httpjson.Decode(w, r, &body) {
			if body.Groups == nil {
				body.Groups = []string{}
			}
			reply(w, h.service.Invite(r.Context(), token(r), p[0], body.Email, body.Role, body.Groups), ok)
		}
	})
	route("DELETE "+base+"/{org}/invitations/{invitation}", true, func(w http.ResponseWriter, r *http.Request) {
		if p, valid := ids(w, r, "org", "invitation"); valid {
			reply(w, h.service.CancelInvitation(r.Context(), token(r), p[0], p[1]), ok)
		}
	})
	route("PUT "+base+"/{org}/members/{member}", true, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Role   string   `json:"role"`
			Groups []string `json:"groups"`
		}
		if p, valid := ids(w, r, "org", "member"); valid && httpjson.Decode(w, r, &body) {
			if body.Groups == nil {
				body.Groups = []string{}
			}
			reply(w, h.service.UpdateMember(r.Context(), token(r), p[0], p[1], body.Role, body.Groups), ok)
		}
	})
	route("DELETE "+base+"/{org}/members/{member}", true, func(w http.ResponseWriter, r *http.Request) {
		if p, valid := ids(w, r, "org", "member"); valid {
			reply(w, h.service.RemoveMember(r.Context(), token(r), p[0], p[1]), ok)
		}
	})
	route("POST "+base+"/{org}/groups", true, func(w http.ResponseWriter, r *http.Request) {
		var body Group
		if p, valid := ids(w, r, "org"); valid && httpjson.Decode(w, r, &body) {
			id, err := h.service.CreateGroup(r.Context(), token(r), p[0], body)
			reply(w, err, map[string]string{"id": id})
		}
	})
	route("PUT "+base+"/{org}/groups/{group}", true, func(w http.ResponseWriter, r *http.Request) {
		var body Group
		if p, valid := ids(w, r, "org", "group"); valid && httpjson.Decode(w, r, &body) {
			reply(w, h.service.UpdateGroup(r.Context(), token(r), p[0], p[1], body), ok)
		}
	})
	route("DELETE "+base+"/{org}/groups/{group}", true, func(w http.ResponseWriter, r *http.Request) {
		if p, valid := ids(w, r, "org", "group"); valid {
			reply(w, h.service.DeleteGroup(r.Context(), token(r), p[0], p[1]), ok)
		}
	})
	for _, answer := range []struct {
		path   string
		accept bool
	}{{"accept", true}, {"decline", false}} {
		route("POST /api/v1/organisation-invitations/{invitation}/"+answer.path, true, func(w http.ResponseWriter, r *http.Request) {
			var body struct{}
			if p, valid := ids(w, r, "invitation"); valid && httpjson.Decode(w, r, &body) {
				reply(w, h.service.Answer(r.Context(), token(r), p[0], answer.accept), ok)
			}
		})
	}
}
