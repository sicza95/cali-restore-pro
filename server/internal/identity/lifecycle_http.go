package identity

import (
	"encoding/json"
	"net/http"

	"github.com/sicza95/cali-restore-pro/server/internal/httpjson"
	"github.com/sicza95/cali-restore-pro/server/internal/identity/sessiontoken"
)

func (h *HTTP) lifecycleRoutes(route func(string, bool, http.HandlerFunc)) {
	for _, action := range []string{"register", "resend-verification", "forgot-password", "verify-email", "confirm-email", "change-password", "change-email"} {
		route("POST /api/v1/auth/"+action, action == "change-password" || action == "change-email", func(w http.ResponseWriter, r *http.Request) {
			var body struct {
				Email    string `json:"email"`
				Password string `json:"password"`
				Language string `json:"language"`
				Token    string `json:"token"`
				Confirm  bool   `json:"confirm"`
			}
			var fields map[string]json.RawMessage
			if !httpjson.Decode(w, r, &fields) {
				return
			}
			allowed := map[string]bool{}
			required := []string{}
			switch action {
			case "register":
				required = []string{"email"}
				allowed["language"] = true
			case "resend-verification", "forgot-password":
				required = []string{"email"}
				allowed["language"] = true
			case "verify-email", "confirm-email":
				required = []string{"token"}
			case "change-password":
				required = []string{"password", "confirm"}
			case "change-email":
				required = []string{"email", "confirm"}
			}
			for _, key := range required {
				allowed[key] = true
				if _, ok := fields[key]; !ok {
					httpjson.Respond(w, 400, map[string]string{"error": "invalid_request"})
					return
				}
			}
			for key, value := range fields {
				if !allowed[key] || string(value) == "null" {
					httpjson.Respond(w, 400, map[string]string{"error": "invalid_request"})
					return
				}
			}
			encoded, _ := json.Marshal(fields)
			if json.Unmarshal(encoded, &body) != nil || (body.Language != "" && body.Language != "en" && body.Language != "hu") {
				httpjson.Respond(w, 400, map[string]string{"error": "invalid_request"})
				return
			}
			var err error
			switch action {
			case "register":
				err = h.service.RegisterAccount(r.Context(), body.Email, body.Language)
			case "resend-verification":
				err = h.service.ResendVerification(r.Context(), body.Email, body.Language)
			case "forgot-password":
				err = h.service.ForgotPassword(r.Context(), body.Email, body.Language)
			case "verify-email":
				err = h.service.ConsumeLink(r.Context(), body.Token, "verify")
			case "confirm-email":
				err = h.service.ConsumeLink(r.Context(), body.Token, "email")
			case "change-password", "change-email":
				if !body.Confirm {
					err = ErrForbidden
				} else if action == "change-password" {
					err = h.service.ChangeCredential(r.Context(), h.Token(r), body.Password, "")
				} else {
					err = h.service.ChangeCredential(r.Context(), h.Token(r), "", body.Email)
				}
			}
			if err != nil {
				Failure(w, err)
				return
			}
			if action == "change-password" {
				h.SetCookie(w, "")
			}
			// Accepted means durable transaction, never a claim of SMTP delivery.
			httpjson.Respond(w, 200, map[string]bool{"ok": true})
		})
	}
}

// codeRoutes check a sign-up or reset code or link (no side effect beyond
// counting a wrong code) and set the password, which signs the person in.
func (h *HTTP) codeRoutes(route func(string, bool, http.HandlerFunc)) {
	decode := func(w http.ResponseWriter, r *http.Request, withPassword bool) (CodeProof, string, bool) {
		var fields map[string]json.RawMessage
		if !httpjson.Decode(w, r, &fields) {
			return CodeProof{}, "", false
		}
		var body struct {
			Email    string `json:"email"`
			Code     string `json:"code"`
			Token    string `json:"token"`
			Password string `json:"password"`
		}
		encoded, _ := json.Marshal(fields)
		_, hasToken := fields["token"]
		_, hasEmail := fields["email"]
		_, hasCode := fields["code"]
		_, hasPassword := fields["password"]
		shape := (hasToken && !hasEmail && !hasCode) || (!hasToken && hasEmail && hasCode)
		for key, value := range fields {
			known := key == "token" || key == "email" || key == "code" || key == "password"
			if !known || string(value) == "null" {
				shape = false
			}
		}
		if !shape || hasPassword != withPassword || json.Unmarshal(encoded, &body) != nil {
			httpjson.Respond(w, 400, map[string]string{"error": "invalid_request"})
			return CodeProof{}, "", false
		}
		return CodeProof{Email: body.Email, Code: body.Code, Token: body.Token}, body.Password, true
	}
	route("POST /api/v1/auth/code/check", false, func(w http.ResponseWriter, r *http.Request) {
		proof, _, ok := decode(w, r, false)
		if !ok {
			return
		}
		if err := h.service.CheckCode(r.Context(), proof); err != nil {
			Failure(w, err)
			return
		}
		httpjson.Respond(w, 200, map[string]bool{"ok": true})
	})
	route("POST /api/v1/auth/code/complete", false, func(w http.ResponseWriter, r *http.Request) {
		proof, password, ok := decode(w, r, true)
		if !ok {
			return
		}
		raw, err := h.service.CompleteCode(r.Context(), proof, password)
		if err != nil {
			Failure(w, err)
			return
		}
		h.SetCookie(w, raw)
		httpjson.Respond(w, 200, map[string]string{"csrfToken": sessiontoken.CSRF(raw)})
	})
}
