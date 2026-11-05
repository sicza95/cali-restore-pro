package platform

import (
	"context"
	"encoding/json"
	"io/fs"
	"net/http"
	"path"
	"strings"
	"time"
)

type Readiness func(context.Context) error

func Handler(web fs.FS, ready Readiness, register ...func(*http.ServeMux)) http.Handler {
	mux := http.NewServeMux()
	for _, routes := range register {
		routes(mux)
	}
	write := func(w http.ResponseWriter, status int, value any) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(value)
	}
	mux.HandleFunc("GET /health/live", func(w http.ResponseWriter, r *http.Request) { write(w, 200, map[string]string{"status": "alive"}) })
	status := func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if ready(ctx) != nil {
			write(w, 503, map[string]string{"status": "unavailable", "milestone": "M-00"})
			return
		}
		write(w, 200, map[string]string{"status": "ready", "milestone": "M-00"})
	}
	mux.HandleFunc("GET /health/ready", status)
	mux.HandleFunc("GET /api/v1/status", status)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) { write(w, 404, map[string]string{"error": "not_found"}) })
	mux.HandleFunc("/health/", func(w http.ResponseWriter, r *http.Request) { http.NotFound(w, r) })
	fileServer := http.FileServer(http.FS(web))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" && r.Method != "HEAD" {
			w.Header().Set("Allow", "GET, HEAD")
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if name == "" {
			name = "index.html"
		}
		info, err := fs.Stat(web, name)
		if err != nil || info.IsDir() {
			if path.Ext(name) != "" || strings.HasPrefix(name, "assets/") || !strings.Contains(r.Header.Get("Accept"), "text/html") {
				http.NotFound(w, r)
				return
			}
			copy := r.Clone(r.Context())
			urlCopy := *r.URL
			copy.URL = &urlCopy
			copy.URL.Path = "/"
			fileServer.ServeHTTP(w, copy)
			return
		}
		if strings.HasPrefix(name, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		fileServer.ServeHTTP(w, r)
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
		mux.ServeHTTP(w, r)
	})
}
