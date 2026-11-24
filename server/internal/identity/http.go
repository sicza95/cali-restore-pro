package identity

import (
	"context"
	"crypto/subtle"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/sicza95/cali-restore-pro/server/internal/httpjson"
	"github.com/sicza95/cali-restore-pro/server/internal/identity/sessiontoken"
)

type HTTP struct {
	service            *Service
	origin, cookieName string
	secure             bool
}

func NewHTTP(service *Service, origin string, secure bool) *HTTP {
	name := "calirestore_session"
	if secure {
		name = "__Host-calirestore_session"
	}
	return &HTTP{service: service, origin: strings.TrimRight(origin, "/"), cookieName: name, secure: secure}
}

func (h *HTTP) Token(r *http.Request) string {
	c, err := r.Cookie(h.cookieName)
	if err != nil || !sessiontoken.Valid(c.Value) {
		return ""
	}
	return c.Value
}

func (h *HTTP) SetCookie(w http.ResponseWriter, raw string) {
	age := 2147483647 // Persistent until explicit revocation, not an idle timer.
	if raw == "" {
		age = -1
	}
	http.SetCookie(w, &http.Cookie{Name: h.cookieName, Value: raw, Path: "/", Secure: h.secure, HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: age})
}

func Failure(w http.ResponseWriter, err error) {
	status, code := 503, "unavailable"
	switch {
	case errors.Is(err, ErrInvalid):
		status, code = 400, "invalid_request"
	case errors.Is(err, ErrPasskey):
		status, code = 400, "passkey_rejected"
	case errors.Is(err, ErrPasskeysUnavailable):
		status, code = 404, "passkeys_unavailable"
	case errors.Is(err, ErrCredentials):
		status, code = 401, "invalid_credentials"
	case errors.Is(err, ErrLink):
		status, code = 400, "invalid_or_expired_link"
	case errors.Is(err, ErrUnauthorized):
		status, code = 401, "authentication_required"
	case errors.Is(err, ErrForbidden):
		status, code = 403, "not_permitted"
	case errors.Is(err, ErrRecent):
		status, code = 403, "credential_confirmation_required"
	case errors.Is(err, ErrConflict):
		status, code = 409, "identity_conflict"
	case errors.Is(err, ErrLimited):
		status, code = 429, "try_later"
		w.Header().Set("Retry-After", "900")
	}
	httpjson.Respond(w, status, map[string]string{"error": code})
}

// CookieName is the session cookie name for this origin scheme.
func (h *HTTP) CookieName() string { return h.cookieName }

// Guard returns the route registrar every API route uses: no cross-site
// requests, same-origin writes, CSRF on authenticated writes and a 10 s budget.
func (h *HTTP) Guard(mux *http.ServeMux) func(pattern string, authenticated bool, next http.HandlerFunc) {
	return func(pattern string, authenticated bool, next http.HandlerFunc) {
		mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Cache-Control", "no-store")
			if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
				Failure(w, ErrForbidden)
				return
			}
			if r.Method != "GET" {
				if r.Header.Get("Origin") != h.origin {
					Failure(w, ErrForbidden)
					return
				}
				if authenticated {
					raw := h.Token(r)
					if raw == "" {
						Failure(w, ErrUnauthorized)
						return
					}
					if subtle.ConstantTimeCompare([]byte(sessiontoken.CSRF(raw)), []byte(r.Header.Get("X-CSRF-Token"))) != 1 {
						Failure(w, ErrForbidden)
						return
					}
				}
			}
			ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
			defer cancel()
			next(w, r.WithContext(ctx))
		})
	}
}

// Register adds the account, session and admin routes. Project routes live in
// internal/projects and use the same Guard.
func (h *HTTP) Register(mux *http.ServeMux) {
	route := h.Guard(mux)
	h.lifecycleRoutes(route)
	h.codeRoutes(route)
	h.adminRoutes(route)
	h.passkeyRoutes(route)
	route("POST /api/v1/auth/login", false, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if !httpjson.Decode(w, r, &body) {
			return
		}
		raw, err := h.service.Login(r.Context(), body.Email, body.Password, "")
		if err != nil {
			Failure(w, err)
			return
		}
		h.SetCookie(w, raw)
		httpjson.Respond(w, 200, map[string]string{"csrfToken": sessiontoken.CSRF(raw)})
	})
	route("GET /api/v1/auth/me", true, func(w http.ResponseWriter, r *http.Request) {
		current, err := h.service.Current(r.Context(), h.Token(r))
		if err != nil {
			Failure(w, err)
			return
		}
		// The page enables security changes until the confirmation lapses; the
		// server still checks RequireRecent on every change.
		var confirmedUntil *time.Time
		if RequireRecent(current) == nil {
			until := current.VerifiedAt.Add(recentWindow).UTC()
			confirmedUntil = &until
		}
		httpjson.Respond(w, 200, struct {
			Account        Account      `json:"account"`
			Capabilities   []Capability `json:"capabilities"`
			CSRFToken      string       `json:"csrfToken"`
			ConfirmedUntil *time.Time   `json:"confirmedUntil"`
		}{current.Account, current.Account.Capabilities(), sessiontoken.CSRF(h.Token(r)), confirmedUntil})
	})
	route("POST /api/v1/auth/confirm", true, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Password string `json:"password"`
		}
		if !httpjson.Decode(w, r, &body) {
			return
		}
		current, err := h.service.Current(r.Context(), h.Token(r))
		if err != nil {
			Failure(w, err)
			return
		}
		raw, err := h.service.Login(r.Context(), current.Account.Email, body.Password, h.Token(r))
		if err != nil {
			Failure(w, err)
			return
		}
		h.SetCookie(w, raw)
		httpjson.Respond(w, 200, map[string]string{"csrfToken": sessiontoken.CSRF(raw)})
	})
	route("POST /api/v1/auth/logout", true, func(w http.ResponseWriter, r *http.Request) {
		var body struct{}
		if !httpjson.Decode(w, r, &body) {
			return
		}
		if err := h.service.Logout(r.Context(), h.Token(r)); err != nil {
			Failure(w, err)
			return
		}
		h.SetCookie(w, "")
		httpjson.Respond(w, 200, map[string]bool{"ok": true})
	})
	route("GET /api/v1/auth/sessions", true, func(w http.ResponseWriter, r *http.Request) {
		list, err := h.service.Sessions(r.Context(), h.Token(r))
		if err != nil {
			Failure(w, err)
			return
		}
		httpjson.Respond(w, 200, map[string]any{"sessions": list})
	})
	route("POST /api/v1/auth/sessions/revoke", true, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			SessionID string `json:"sessionId"`
			All       bool   `json:"all"`
			Confirm   bool   `json:"confirm"`
		}
		if !httpjson.Decode(w, r, &body) {
			return
		}
		if !body.Confirm || (body.All == (body.SessionID != "")) || (body.SessionID != "" && !httpjson.UUID(body.SessionID)) {
			Failure(w, ErrForbidden)
			return
		}
		current, err := h.service.Current(r.Context(), h.Token(r))
		if err != nil {
			Failure(w, err)
			return
		}
		if err := h.service.Revoke(r.Context(), h.Token(r), current.Account.ID, body.SessionID); err != nil {
			Failure(w, err)
			return
		}
		if body.All || body.SessionID == current.ID {
			h.SetCookie(w, "")
		}
		httpjson.Respond(w, 200, map[string]bool{"ok": true})
	})
	route("POST /api/v1/admin/accounts/{id}/policy", true, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Role    string `json:"role"`
			State   string `json:"state"`
			Confirm bool   `json:"confirm"`
		}
		if !httpjson.Decode(w, r, &body) {
			return
		}
		if !body.Confirm || !httpjson.UUID(r.PathValue("id")) {
			Failure(w, ErrForbidden)
			return
		}
		if err := h.service.SetPolicy(r.Context(), h.Token(r), r.PathValue("id"), body.Role, body.State); err != nil {
			Failure(w, err)
			return
		}
		httpjson.Respond(w, 200, map[string]bool{"ok": true})
	})
	route("POST /api/v1/admin/accounts/{id}/sessions/revoke", true, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Confirm bool `json:"confirm"`
		}
		if !httpjson.Decode(w, r, &body) {
			return
		}
		if !body.Confirm || !httpjson.UUID(r.PathValue("id")) {
			Failure(w, ErrForbidden)
			return
		}
		if err := h.service.revoke(r.Context(), h.Token(r), r.PathValue("id"), "", true); err != nil {
			Failure(w, err)
			return
		}
		httpjson.Respond(w, 200, map[string]bool{"ok": true})
	})
}
