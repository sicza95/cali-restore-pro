package identity

import (
	"encoding/json"
	"net/http"

	"github.com/sicza95/cali-restore-pro/server/internal/httpjson"
	"github.com/sicza95/cali-restore-pro/server/internal/identity/sessiontoken"
)

// Attestation objects and assertions are larger than the 4 KiB credential forms.
const passkeyBodyLimit = 32 << 10

type ceremonyResponse struct {
	Ceremony  string `json:"ceremony"`
	PublicKey any    `json:"publicKey"`
}

func (h *HTTP) passkeyRoutes(route func(string, bool, http.HandlerFunc)) {
	route("GET /api/v1/auth/passkeys", true, func(w http.ResponseWriter, r *http.Request) {
		list, err := h.service.Passkeys(r.Context(), h.Token(r))
		if err != nil {
			Failure(w, err)
			return
		}
		httpjson.Respond(w, 200, map[string]any{"available": h.service.PasskeysAvailable(), "passkeys": list})
	})
	route("POST /api/v1/auth/passkeys/register/options", true, func(w http.ResponseWriter, r *http.Request) {
		var body struct{}
		if !httpjson.Decode(w, r, &body) {
			return
		}
		options, ceremony, err := h.service.BeginPasskeyRegistration(r.Context(), h.Token(r))
		if err != nil {
			Failure(w, err)
			return
		}
		httpjson.Respond(w, 200, ceremonyResponse{ceremony, options})
	})
	route("POST /api/v1/auth/passkeys/register", true, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Ceremony   string          `json:"ceremony"`
			Name       string          `json:"name"`
			Credential json.RawMessage `json:"credential"`
		}
		if !httpjson.DecodeBounded(w, r, &body, passkeyBodyLimit) {
			return
		}
		if len(body.Credential) == 0 {
			Failure(w, ErrInvalid)
			return
		}
		if err := h.service.FinishPasskeyRegistration(r.Context(), h.Token(r), body.Ceremony, body.Name, body.Credential); err != nil {
			Failure(w, err)
			return
		}
		httpjson.Respond(w, 200, map[string]bool{"ok": true})
	})
	route("POST /api/v1/auth/passkeys/remove", true, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			PasskeyID string `json:"passkeyId"`
			Confirm   bool   `json:"confirm"`
		}
		if !httpjson.Decode(w, r, &body) {
			return
		}
		if !body.Confirm || !httpjson.UUID(body.PasskeyID) {
			Failure(w, ErrForbidden)
			return
		}
		if err := h.service.RemovePasskey(r.Context(), h.Token(r), body.PasskeyID); err != nil {
			Failure(w, err)
			return
		}
		httpjson.Respond(w, 200, map[string]bool{"ok": true})
	})
	route("POST /api/v1/auth/passkey-login/options", false, func(w http.ResponseWriter, r *http.Request) {
		var body struct{}
		if !httpjson.Decode(w, r, &body) {
			return
		}
		options, ceremony, err := h.service.BeginPasskeyLogin(r.Context())
		if err != nil {
			Failure(w, err)
			return
		}
		httpjson.Respond(w, 200, ceremonyResponse{ceremony, options})
	})
	route("POST /api/v1/auth/passkey-login", false, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Ceremony   string          `json:"ceremony"`
			Credential json.RawMessage `json:"credential"`
		}
		if !httpjson.DecodeBounded(w, r, &body, passkeyBodyLimit) {
			return
		}
		if len(body.Credential) == 0 {
			Failure(w, ErrInvalid)
			return
		}
		raw, err := h.service.FinishPasskeyLogin(r.Context(), body.Ceremony, body.Credential)
		if err != nil {
			Failure(w, err)
			return
		}
		h.SetCookie(w, raw)
		httpjson.Respond(w, 200, map[string]string{"csrfToken": sessiontoken.CSRF(raw)})
	})
}
