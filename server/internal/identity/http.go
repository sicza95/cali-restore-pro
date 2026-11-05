package identity

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"
	"time"
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

func (h *HTTP) raw(r *http.Request) string {
	c, err := r.Cookie(h.cookieName)
	if err != nil || !validToken(c.Value) {
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

func respond(w http.ResponseWriter, code int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(value)
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
	respond(w, status, map[string]string{"error": code})
}

func decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		respond(w, 415, map[string]string{"error": "json_required"})
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	var body json.RawMessage
	if err := d.Decode(&body); err != nil {
		respond(w, 400, map[string]string{"error": "invalid_request"})
		return false
	}
	if len(body) == 0 || body[0] != '{' {
		respond(w, 400, map[string]string{"error": "invalid_request"})
		return false
	}
	strict := json.NewDecoder(strings.NewReader(string(body)))
	strict.DisallowUnknownFields()
	if err := strict.Decode(dst); err != nil {
		respond(w, 400, map[string]string{"error": "invalid_request"})
		return false
	}
	if err := d.Decode(new(any)); err != io.EOF {
		respond(w, 400, map[string]string{"error": "invalid_request"})
		return false
	}
	return true
}

func uuid(value string) bool {
	if len(value) != 36 {
		return false
	}
	for i, c := range value {
		if i == 8 || i == 13 || i == 18 || i == 23 {
			if c != '-' {
				return false
			}
			continue
		}
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f') {
			return false
		}
	}
	return true
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
					if subtle.ConstantTimeCompare([]byte(CSRF(raw)), []byte(r.Header.Get("X-CSRF-Token"))) != 1 {
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
	route("POST /api/v1/auth/login", false, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if !decode(w, r, &body) {
			return
		}
		raw, err := h.service.Login(r.Context(), body.Email, body.Password, "")
		if err != nil {
			failure(w, err)
			return
		}
		h.setCookie(w, raw)
		respond(w, 200, map[string]string{"csrfToken": CSRF(raw)})
	})
	route("GET /api/v1/auth/me", true, func(w http.ResponseWriter, r *http.Request) {
		current, err := h.service.Current(r.Context(), h.raw(r))
		if err != nil {
			failure(w, err)
			return
		}
		respond(w, 200, struct {
			Account      Account      `json:"account"`
			Capabilities []Capability `json:"capabilities"`
			CSRFToken    string       `json:"csrfToken"`
		}{current.Account, current.Account.Capabilities(), CSRF(h.raw(r))})
	})
	route("POST /api/v1/auth/confirm", true, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Password string `json:"password"`
		}
		if !decode(w, r, &body) {
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
		respond(w, 200, map[string]string{"csrfToken": CSRF(raw)})
	})
	route("POST /api/v1/auth/logout", true, func(w http.ResponseWriter, r *http.Request) {
		var body struct{}
		if !decode(w, r, &body) {
			return
		}
		if err := h.service.Logout(r.Context(), h.raw(r)); err != nil {
			failure(w, err)
			return
		}
		h.setCookie(w, "")
		respond(w, 200, map[string]bool{"ok": true})
	})
	route("GET /api/v1/auth/sessions", true, func(w http.ResponseWriter, r *http.Request) {
		list, err := h.service.Sessions(r.Context(), h.raw(r))
		if err != nil {
			failure(w, err)
			return
		}
		respond(w, 200, map[string]any{"sessions": list})
	})
	route("POST /api/v1/auth/sessions/revoke", true, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			SessionID string `json:"sessionId"`
			All       bool   `json:"all"`
			Confirm   bool   `json:"confirm"`
		}
		if !decode(w, r, &body) {
			return
		}
		if !body.Confirm || (body.All == (body.SessionID != "")) || (body.SessionID != "" && !uuid(body.SessionID)) {
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
		respond(w, 200, map[string]bool{"ok": true})
	})
	route("POST /api/v1/admin/accounts/{id}/policy", true, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Role    string `json:"role"`
			State   string `json:"state"`
			Confirm bool   `json:"confirm"`
		}
		if !decode(w, r, &body) {
			return
		}
		if !body.Confirm || !uuid(r.PathValue("id")) {
			failure(w, ErrForbidden)
			return
		}
		if err := h.service.SetPolicy(r.Context(), h.raw(r), r.PathValue("id"), body.Role, body.State); err != nil {
			failure(w, err)
			return
		}
		respond(w, 200, map[string]bool{"ok": true})
	})
	route("POST /api/v1/admin/accounts/{id}/sessions/revoke", true, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Confirm bool `json:"confirm"`
		}
		if !decode(w, r, &body) {
			return
		}
		if !body.Confirm || !uuid(r.PathValue("id")) {
			failure(w, ErrForbidden)
			return
		}
		if err := h.service.revoke(r.Context(), h.raw(r), r.PathValue("id"), "", true); err != nil {
			failure(w, err)
			return
		}
		respond(w, 200, map[string]bool{"ok": true})
	})
}
