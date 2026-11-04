package platform

import (
	"context"
	"errors"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

func TestRoutesAndDependencyLoss(t *testing.T) {
	available := true
	h := Handler(fstest.MapFS{"index.html": {Data: []byte("app shell")}, "assets/app-123.js": {Data: []byte("app")}}, func(context.Context) error {
		if !available {
			return errors.New("private database detail")
		}
		return nil
	})
	for _, tc := range []struct {
		path, accept string
		code         int
		cache        string
	}{
		{"/health/live", "", 200, "no-store"}, {"/health/ready", "", 200, "no-store"}, {"/api/v1/status", "", 200, "no-store"},
		{"/api/v1/missing", "text/html", 404, "no-store"}, {"/assets/missing.js", "text/html", 404, "no-cache"}, {"/", "", 200, "no-cache"}, {"/account", "text/html", 200, "no-cache"}, {"/assets/app-123.js", "", 200, "public, max-age=31536000, immutable"},
	} {
		r := httptest.NewRequest("GET", tc.path, nil)
		r.Header.Set("Accept", tc.accept)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != tc.code || w.Header().Get("Cache-Control") != tc.cache {
			t.Errorf("%s: %d %v", tc.path, w.Code, w.Header())
		}
	}
	available = false
	for _, p := range []string{"/health/ready", "/api/v1/status"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest("GET", p, nil))
		if w.Code != 503 || w.Body.String() == "private database detail" {
			t.Fatal(w)
		}
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/health/live", nil))
	if w.Code != 200 {
		t.Fatal("liveness depends on database")
	}
	available = true
	w = httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/health/ready", nil))
	if w.Code != 200 {
		t.Fatal("readiness did not recover")
	}
}
