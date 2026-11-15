package identity

import (
	"net/http"

	"github.com/sicza95/cali-restore-pro/server/internal/httpjson"
)

func (h *HTTP) adminRoutes(route func(string, bool, http.HandlerFunc)) {
	route("GET /api/v1/admin/accounts", true, func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()
		accounts, err := h.service.AdminAccounts(r.Context(), h.Token(r), query.Get("q"), query.Get("after"))
		if err != nil {
			Failure(w, err)
			return
		}
		next := ""
		if len(accounts) > pageSize {
			accounts = accounts[:pageSize]
			next = accounts[len(accounts)-1].ID
		}
		if accounts == nil {
			accounts = []AdminAccount{}
		}
		httpjson.Respond(w, 200, map[string]any{"accounts": accounts, "next": next})
	})
	route("GET /api/v1/admin/operations", true, func(w http.ResponseWriter, r *http.Request) {
		result, err := h.service.Operations(r.Context(), h.Token(r))
		if err != nil {
			Failure(w, err)
			return
		}
		httpjson.Respond(w, 200, result)
	})
	route("POST /api/v1/admin/accounts/{id}/controls", true, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Confirm     bool `json:"confirm"`
			Entitlement *struct {
				ServerFeatures *bool `json:"serverFeatures"`
				QuotaMiB       *int  `json:"quotaMiB"`
			} `json:"entitlement"`
			Permissions *int `json:"permissions"`
		}
		if !httpjson.Decode(w, r, &body) {
			return
		}
		if !body.Confirm || !httpjson.UUID(r.PathValue("id")) {
			Failure(w, ErrForbidden)
			return
		}
		var entitlement *Entitlement
		if body.Entitlement != nil {
			if body.Entitlement.ServerFeatures == nil || body.Entitlement.QuotaMiB == nil {
				Failure(w, ErrInvalid)
				return
			}
			entitlement = &Entitlement{*body.Entitlement.ServerFeatures, *body.Entitlement.QuotaMiB}
		}
		if err := h.service.SetAdminControls(r.Context(), h.Token(r), r.PathValue("id"), entitlement, body.Permissions); err != nil {
			Failure(w, err)
			return
		}
		httpjson.Respond(w, 200, map[string]bool{"ok": true})
	})
	for _, path := range []string{"GET /api/v1/account/deletion-preflight", "GET /api/v1/admin/accounts/{id}/deletion-preflight"} {
		route(path, true, func(w http.ResponseWriter, r *http.Request) {
			actor, err := h.service.Current(r.Context(), h.Token(r))
			if err != nil {
				Failure(w, err)
				return
			}
			id := r.PathValue("id")
			if id != "" && (!httpjson.UUID(id) || !actor.Account.Allows(ManageRoles)) {
				Failure(w, ErrForbidden)
				return
			}
			if id == "" {
				id = actor.Account.ID
			}
			reason, err := DeletionPreflight(r.Context(), h.service.pool, id)
			if err != nil {
				Failure(w, err)
				return
			}
			httpjson.Respond(w, 200, map[string]any{"eligible": reason == "", "reason": reason,
				"forceEligible": reason == "hosted_projects_require_continuity" &&
					id != actor.Account.ID && actor.Account.Role == "superuser"})
		})
	}
}
