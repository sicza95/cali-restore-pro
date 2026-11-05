package identity

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLifecycleRequestBoundaries(t *testing.T) {
	mux := http.NewServeMux()
	NewHTTP(nil, "https://restore.example", true).Register(mux)
	for _, item := range []struct{ action, body string }{
		{"register", `{"email":"synthetic@example.test","password":"synthetic long password","role":"superuser"}`},
		{"register", `{"email":"synthetic@example.test","password":"synthetic long password","language":"xx"}`},
		{"forgot-password", `{"email":"synthetic@example.test","password":"unrelated field"}`},
		{"verify-email", `{"token":null}`},
		{"reset-password", `{"token":"a"}`},
		{"confirm-email", `{"token":43}`},
		{"resend-verification", `{} {}`},
	} {
		r := httptest.NewRequest("POST", "/api/v1/auth/"+item.action, strings.NewReader(item.body))
		r.Header.Set("Origin", "https://restore.example")
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		if w.Code != 400 || w.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("%s accepted invalid shape: %d", item.action, w.Code)
		}
	}
	for _, action := range []string{"register", "forgot-password", "resend-verification", "reset-password", "verify-email", "confirm-email", "change-password", "change-email"} {
		r := httptest.NewRequest("POST", "/api/v1/auth/"+action, strings.NewReader(`{}`))
		r.Header.Set("Origin", "https://attacker.example")
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		if w.Code != 403 {
			t.Fatalf("%s origin bypass", action)
		}
	}
}
