package identity

import (
	"errors"
	"net/http"

	"github.com/sicza95/cali-restore-pro/server/internal/httpjson"
)

// A base64 photo of at most 256 KiB plus the name and JSON framing.
const profileBodyLimit = 384 << 10

func (h *HTTP) profileRoutes(route func(string, bool, http.HandlerFunc)) {
	route("POST /api/v1/auth/profile", true, func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Name  string  `json:"name"`
			Photo *string `json:"photo"`
		}
		if !httpjson.DecodeBounded(w, r, &body, profileBodyLimit) {
			return
		}
		if err := h.service.UpdateProfile(r.Context(), h.Token(r), Profile{Name: body.Name, Photo: body.Photo}); err != nil {
			Failure(w, err)
			return
		}
		httpjson.Respond(w, 200, map[string]bool{"ok": true})
	})
	route("GET /api/v1/auth/photo", true, func(w http.ResponseWriter, r *http.Request) {
		picture, _, err := h.service.Photo(r.Context(), h.Token(r))
		if errors.Is(err, errNoPhoto) {
			httpjson.Respond(w, 404, map[string]string{"error": "not_found"})
			return
		}
		if err != nil {
			Failure(w, err)
			return
		}
		// The URL carries the photo's version, so this browser may keep it.
		w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
		w.Header().Set("Content-Type", "image/jpeg")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Content-Security-Policy", "default-src 'none'")
		_, _ = w.Write(picture)
	})
}
