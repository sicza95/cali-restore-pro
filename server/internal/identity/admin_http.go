package identity

import "net/http"

func (h *HTTP) adminRoutes(route func(string, bool, http.HandlerFunc)) {
	route("GET /api/v1/admin/accounts", true, func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()
		accounts, err := h.service.AdminAccounts(r.Context(), h.raw(r), query.Get("q"), query.Get("after"))
		if err != nil {
			failure(w, err)
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
		respond(w, 200, map[string]any{"accounts": accounts, "next": next})
	})
	route("GET /api/v1/admin/operations", true, func(w http.ResponseWriter, r *http.Request) {
		result, err := h.service.Operations(r.Context(), h.raw(r))
		if err != nil {
			failure(w, err)
			return
		}
		respond(w, 200, result)
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
		if !decode(w, r, &body) {
			return
		}
		if !body.Confirm || !uuid(r.PathValue("id")) {
			failure(w, ErrForbidden)
			return
		}
		var entitlement *Entitlement
		if body.Entitlement != nil {
			if body.Entitlement.ServerFeatures == nil || body.Entitlement.QuotaMiB == nil {
				failure(w, ErrInvalid)
				return
			}
			entitlement = &Entitlement{*body.Entitlement.ServerFeatures, *body.Entitlement.QuotaMiB}
		}
		if err := h.service.SetAdminControls(r.Context(), h.raw(r), r.PathValue("id"), entitlement, body.Permissions); err != nil {
			failure(w, err)
			return
		}
		respond(w, 200, map[string]bool{"ok": true})
	})
	for _, path := range []string{"GET /api/v1/account/deletion-preflight", "GET /api/v1/admin/accounts/{id}/deletion-preflight"} {
		route(path, true, func(w http.ResponseWriter, r *http.Request) {
			actor, err := h.service.Current(r.Context(), h.raw(r))
			if err != nil {
				failure(w, err)
				return
			}
			id := r.PathValue("id")
			if id != "" && (!uuid(id) || !actor.Account.Allows(ManageRoles)) {
				failure(w, ErrForbidden)
				return
			}
			if id == "" {
				id = actor.Account.ID
			}
			reason, err := accountDeletionPreflight(r.Context(), h.service.pool, id)
			if err != nil {
				failure(w, err)
				return
			}
			respond(w, 200, map[string]any{"eligible": reason == "", "reason": reason})
		})
	}
}
