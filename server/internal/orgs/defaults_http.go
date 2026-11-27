package orgs

import (
	"github.com/sicza95/cali-restore-pro/server/internal/httpjson"
	"net/http"
)

func (h *HTTP) defaultsRoutes(route func(string, bool, http.HandlerFunc)) {
	route("PATCH /api/v1/organisations/{org}/defaults", true, func(w http.ResponseWriter, r *http.Request) {
		org := r.PathValue("org")
		if !httpjson.UUID(org) {
			failure(w, errNotFound)
			return
		}
		var patch DefaultsPatch
		if httpjson.DecodeBounded(w, r, &patch, 750000) {
			reply(w, h.service.UpdateDefaults(r.Context(), h.auth.Token(r), org, patch), ok)
		}
	})
}
