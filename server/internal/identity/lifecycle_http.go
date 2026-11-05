package identity

import (
	"encoding/json"
	"net/http"
)

func (h *HTTP) lifecycleRoutes(route func(string, bool, http.HandlerFunc)) {
	for _, action := range []string{"register", "resend-verification", "forgot-password", "verify-email", "reset-password", "confirm-email", "change-password", "change-email"} {
		route("POST /api/v1/auth/"+action, action == "change-password" || action == "change-email", func(w http.ResponseWriter, r *http.Request) {
			var body struct {
				Email    string `json:"email"`
				Password string `json:"password"`
				Language string `json:"language"`
				Token    string `json:"token"`
				Confirm  bool   `json:"confirm"`
			}
			var fields map[string]json.RawMessage
			if !decode(w, r, &fields) {
				return
			}
			allowed := map[string]bool{}
			required := []string{}
			switch action {
			case "register":
				required = []string{"email", "password"}
				allowed["language"] = true
			case "resend-verification", "forgot-password":
				required = []string{"email"}
				allowed["language"] = true
			case "verify-email", "confirm-email":
				required = []string{"token"}
			case "reset-password":
				required = []string{"token", "password"}
			case "change-password":
				required = []string{"password", "confirm"}
			case "change-email":
				required = []string{"email", "confirm"}
			}
			for _, key := range required {
				allowed[key] = true
				if _, ok := fields[key]; !ok {
					respond(w, 400, map[string]string{"error": "invalid_request"})
					return
				}
			}
			for key, value := range fields {
				if !allowed[key] || string(value) == "null" {
					respond(w, 400, map[string]string{"error": "invalid_request"})
					return
				}
			}
			encoded, _ := json.Marshal(fields)
			if json.Unmarshal(encoded, &body) != nil || (body.Language != "" && body.Language != "en" && body.Language != "hu") {
				respond(w, 400, map[string]string{"error": "invalid_request"})
				return
			}
			var err error
			switch action {
			case "register":
				err = h.service.RegisterAccount(r.Context(), body.Email, body.Password, body.Language)
			case "resend-verification":
				err = h.service.RequestLink(r.Context(), body.Email, body.Language, "verify")
			case "forgot-password":
				err = h.service.RequestLink(r.Context(), body.Email, body.Language, "reset")
			case "verify-email":
				err = h.service.ConsumeLink(r.Context(), body.Token, "verify", "")
			case "reset-password":
				err = h.service.ConsumeLink(r.Context(), body.Token, "reset", body.Password)
			case "confirm-email":
				err = h.service.ConsumeLink(r.Context(), body.Token, "email", "")
			case "change-password", "change-email":
				if !body.Confirm {
					err = ErrForbidden
				} else if action == "change-password" {
					err = h.service.ChangeCredential(r.Context(), h.raw(r), body.Password, "")
				} else {
					err = h.service.ChangeCredential(r.Context(), h.raw(r), "", body.Email)
				}
			}
			if err != nil {
				failure(w, err)
				return
			}
			if action == "change-password" {
				h.setCookie(w, "")
			}
			// Accepted means durable transaction, never a claim of SMTP delivery.
			respond(w, 200, map[string]bool{"ok": true})
		})
	}
}
