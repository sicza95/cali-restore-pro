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
	objects            *fileObjects
}

func NewHTTP(service *Service, origin string, secure bool) *HTTP {
	name := "calirestore_session"
	if secure {
		name = "__Host-calirestore_session"
	}
	return &HTTP{service: service, origin: strings.TrimRight(origin, "/"), cookieName: name, secure: secure}
}

func (h *HTTP) EnableFiles(root string) { h.objects = &fileObjects{root: root} }

func (h *HTTP) raw(r *http.Request) string {
	c, err := r.Cookie(h.cookieName)
	if err != nil || !sessiontoken.Valid(c.Value) {
		return ""
	}
	return c.Value
}

func (h *HTTP) setCookie(w http.ResponseWriter, raw string) {
	age := 2147483647 // Persistent until explicit revocation, not an idle timer.
	if raw == "" {
		age = -1
	}
	http.SetCookie(w, &http.Cookie{Name: h.cookieName, Value: raw, Path: "/", Secure: h.secure, HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: age})
}

func failure(w http.ResponseWriter, err error) {
	status, code := 503, "unavailable"
	switch {
	case errors.Is(err, ErrInvalid):
		status, code = 400, "invalid_request"
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

func (h *HTTP) Register(mux *http.ServeMux) {
	route := func(pattern string, authenticated bool, next http.HandlerFunc) {
		mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Cache-Control", "no-store")
			if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
				failure(w, ErrForbidden)
				return
			}
			if r.Method != "GET" {
				if r.Header.Get("Origin") != h.origin {
					failure(w, ErrForbidden)
					return
				}
				if authenticated {
					raw := h.raw(r)
					if raw == "" {
						failure(w, ErrUnauthorized)
						return
					}
					if subtle.ConstantTimeCompare([]byte(sessiontoken.CSRF(raw)), []byte(r.Header.Get("X-CSRF-Token"))) != 1 {
						failure(w, ErrForbidden)
						return
					}
				}
			}
			ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
			defer cancel()
			next(w, r.WithContext(ctx))
		})
	}
	h.lifecycleRoutes(route)
	h.adminRoutes(route)
	h.deletionRoutes(route)
	if h.objects != nil {
		h.fileRoutes(route, *h.objects)
		h.invitationRoutes(route)
		h.activationRoutes(route)
		h.scopeRoutes(route)
		h.checkpointRoutes(route)
		h.ownerRoutes(route)
		h.hostingRoutes(route)
		h.revisionRoutes(route)
		h.revisionKeyRoutes(route)
	}
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
			failure(w, err)
			return
		}
		h.setCookie(w, raw)
		httpjson.Respond(w, 200, map[string]string{"csrfToken": sessiontoken.CSRF(raw)})
	})
	route("GET /api/v1/auth/me", true, func(w http.ResponseWriter, r *http.Request) {
		current, err := h.service.Current(r.Context(), h.raw(r))
		if err != nil {
			failure(w, err)
			return
		}
		httpjson.Respond(w, 200, struct {
			Account      Account      `json:"account"`
			Capabilities []Capability `json:"capabilities"`
			CSRFToken    string       `json:"csrfToken"`
		}{current.Account, current.Account.Capabilities(), sessiontoken.CSRF(h.raw(r))})
	})
	route("POST /api/v1/auth/confirm", true, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Password string `json:"password"`
		}
		if !httpjson.Decode(w, r, &body) {
			return
		}
		current, err := h.service.Current(r.Context(), h.raw(r))
		if err != nil {
			failure(w, err)
			return
		}
		raw, err := h.service.Login(r.Context(), current.Account.Email, body.Password, h.raw(r))
		if err != nil {
			failure(w, err)
			return
		}
		h.setCookie(w, raw)
		httpjson.Respond(w, 200, map[string]string{"csrfToken": sessiontoken.CSRF(raw)})
	})
	route("POST /api/v1/auth/logout", true, func(w http.ResponseWriter, r *http.Request) {
		var body struct{}
		if !httpjson.Decode(w, r, &body) {
			return
		}
		if err := h.service.Logout(r.Context(), h.raw(r)); err != nil {
			failure(w, err)
			return
		}
		h.setCookie(w, "")
		httpjson.Respond(w, 200, map[string]bool{"ok": true})
	})
	route("GET /api/v1/auth/sessions", true, func(w http.ResponseWriter, r *http.Request) {
		list, err := h.service.Sessions(r.Context(), h.raw(r))
		if err != nil {
			failure(w, err)
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
			failure(w, ErrForbidden)
			return
		}
		current, err := h.service.Current(r.Context(), h.raw(r))
		if err != nil {
			failure(w, err)
			return
		}
		if err := h.service.Revoke(r.Context(), h.raw(r), current.Account.ID, body.SessionID); err != nil {
			failure(w, err)
			return
		}
		if body.All || body.SessionID == current.ID {
			h.setCookie(w, "")
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
			failure(w, ErrForbidden)
			return
		}
		if err := h.service.SetPolicy(r.Context(), h.raw(r), r.PathValue("id"), body.Role, body.State); err != nil {
			failure(w, err)
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
			failure(w, ErrForbidden)
			return
		}
		if err := h.service.revoke(r.Context(), h.raw(r), r.PathValue("id"), "", true); err != nil {
			failure(w, err)
			return
		}
		httpjson.Respond(w, 200, map[string]bool{"ok": true})
	})
}
