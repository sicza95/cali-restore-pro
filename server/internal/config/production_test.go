package config

import (
	"strings"
	"testing"
)

func goodProduction() map[string]string {
	return map[string]string{
		"APP_ENV": "production", "APP_ORIGIN": "https://restore.example.org", "DB_USER": "calirestore_app",
		"DB_HOST": "db", "DB_SSLMODE": "disable", "MAIL_KEY_FILE": "/run/secrets/mail_key",
		"SMTP_ADDRESS": "smtp.example.org:587", "SMTP_FROM": "accounts@example.org",
	}
}

func TestCheckProduction(t *testing.T) {
	for _, tc := range []struct {
		name, role string
		set        map[string]string
		want       string
	}{
		{"good worker", "worker", nil, ""},
		{"good serve without smtp", "serve", map[string]string{"SMTP_ADDRESS": "", "SMTP_FROM": ""}, ""},
		{"development ignores everything", "worker", map[string]string{"APP_ENV": "development", "SMTP_ADDRESS": ""}, ""},
		{"local origin", "serve", map[string]string{"APP_ORIGIN": "https://localhost:8443"}, "public host"},
		{"loopback origin", "serve", map[string]string{"APP_ORIGIN": "https://127.0.0.1"}, "public host"},
		{"missing mail key", "serve", map[string]string{"MAIL_KEY_FILE": ""}, "MAIL_KEY_FILE"},
		{"relative mail key", "serve", map[string]string{"MAIL_KEY_FILE": "mail_key"}, "MAIL_KEY_FILE"},
		{"migration role", "serve", map[string]string{"DB_USER": "calirestore_migrator"}, "migration role"},
		{"public db without tls", "serve", map[string]string{"DB_HOST": "db.example.org"}, "verify-full"},
		{"private ip db without tls", "serve", map[string]string{"DB_HOST": "10.0.0.5"}, ""},
		{"public db with tls", "serve", map[string]string{"DB_HOST": "db.example.org", "DB_SSLMODE": "verify-full"}, ""},
		{"mail sink", "worker", map[string]string{"SMTP_ADDRESS": "mail-sink:1025"}, "development mail sink"},
		{"missing smtp", "worker", map[string]string{"SMTP_ADDRESS": ""}, "SMTP_ADDRESS"},
		{"smtp without port", "worker", map[string]string{"SMTP_ADDRESS": "smtp.example.org"}, "SMTP_ADDRESS"},
		{"placeholder sender", "worker", map[string]string{"SMTP_FROM": "accounts@calirestore.invalid"}, "sender domain"},
		{"bad sender", "check-config", map[string]string{"SMTP_FROM": "nobody"}, "SMTP_FROM"},
		{"username without password", "worker", map[string]string{"SMTP_USERNAME": "u"}, "SMTP_PASSWORD_FILE"},
		{"authenticated relay", "worker", map[string]string{"SMTP_USERNAME": "u", "SMTP_PASSWORD_FILE": "/run/secrets/smtp_password"}, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			env := goodProduction()
			for k, v := range tc.set {
				env[k] = v
			}
			err := CheckProduction(Config{Mode: env["APP_ENV"], Origin: env["APP_ORIGIN"]}, func(k string) string { return env[k] }, tc.role)
			if tc.want == "" && err != nil {
				t.Fatal(err)
			}
			if tc.want != "" && (err == nil || !strings.Contains(err.Error(), tc.want)) {
				t.Fatalf("expected %q; got %v", tc.want, err)
			}
		})
	}
}

func TestCheckProductionReportsEveryProblem(t *testing.T) {
	env := goodProduction()
	env["MAIL_KEY_FILE"], env["DB_USER"] = "", "calirestore_migrator"
	err := CheckProduction(Config{Mode: "production", Origin: env["APP_ORIGIN"]}, func(k string) string { return env[k] }, "serve")
	if err == nil || !strings.Contains(err.Error(), "MAIL_KEY_FILE") || !strings.Contains(err.Error(), "migration role") {
		t.Fatalf("expected both problems; got %v", err)
	}
}
