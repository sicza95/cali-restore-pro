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
		{"register", `{"email":"synthetic@example.test","role":"superuser"}`},
		{"register", `{"email":"synthetic@example.test","language":"xx"}`},
		{"register", `{"email":"synthetic@example.test","password":"no longer part of registration"}`},
		{"code/check", `{"email":"synthetic@example.test"}`},
		{"code/check", `{"email":"synthetic@example.test","code":"123456","token":"a"}`},
		{"code/check", `{"token":"a","password":"not checked here"}`},
		{"code/complete", `{"token":"a"}`},
		{"code/complete", `{"code":"123456","password":"synthetic long password"}`},
		{"code/complete", `{"token":null,"password":"synthetic long password"}`},
		{"forgot-password", `{"email":"synthetic@example.test","password":"unrelated field"}`},
		{"verify-email", `{"token":null}`},
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
	for _, action := range []string{"register", "code/check", "code/complete", "forgot-password", "resend-verification", "verify-email", "confirm-email", "change-password", "change-email"} {
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
