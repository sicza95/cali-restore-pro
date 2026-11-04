package config

import (
	"errors"
	"strings"
	"testing"
)

func TestConfig(t *testing.T) {
	for _, tc := range []struct {
		name   string
		values map[string]string
		want   string
	}{
		{"development", map[string]string{}, ""},
		{"missing password", map[string]string{"DB_PASSWORD": ""}, "32 bytes"},
		{"unsafe production", map[string]string{"APP_ENV": "production"}, "HTTPS"},
		{"production env password", map[string]string{"APP_ENV": "production", "APP_ORIGIN": "https://restore.example"}, "DB_PASSWORD_FILE"},
		{"ambiguous", map[string]string{"DB_PASSWORD_FILE": "/secret"}, "only one"},
		{"bad origin", map[string]string{"APP_ORIGIN": "https://user:pass@example.com/path"}, "origin"},
		{"bad ssl", map[string]string{"DB_SSLMODE": "prefer"}, "DB_SSLMODE"},
		{"relative storage", map[string]string{"OBJECT_DIR": "public"}, "absolute"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			env := map[string]string{"DB_USER": "calirestore_app", "DB_PASSWORD": strings.Repeat("x", 32)}
			for k, v := range tc.values {
				env[k] = v
			}
			_, err := load(func(k string) string { return env[k] }, func(string) ([]byte, error) { return nil, errors.New("not readable") })
			if tc.want == "" && err != nil {
				t.Fatal(err)
			}
			if tc.want != "" && (err == nil || !strings.Contains(err.Error(), tc.want)) {
				t.Fatalf("expected %q; got %v", tc.want, err)
			}
		})
	}
}

func TestSecretFile(t *testing.T) {
	env := map[string]string{"DB_USER": "calirestore_app", "DB_PASSWORD_FILE": "/secret", "APP_ENV": "production", "APP_ORIGIN": "https://restore.example"}
	c, err := load(func(k string) string { return env[k] }, func(string) ([]byte, error) { return []byte(strings.Repeat("@:/?#", 8) + "\n"), nil })
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(c.DatabaseURL, "@:/?#") {
		t.Fatal("password not URL-escaped")
	}
}
