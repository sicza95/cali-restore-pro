package config

import (
	"errors"
	"fmt"
	"net"
	"net/mail"
	"net/url"
	"path/filepath"
	"strings"
)

// CheckProduction rejects settings that are missing or unsafe for a
// production deployment. It does nothing outside production. role is the
// command being started: "worker" and "check-config" also require mail relay
// settings, which the web process does not receive.
func CheckProduction(c Config, env func(string) string, role string) error {
	if c.Mode != "production" {
		return nil
	}
	var problems []string
	add := func(format string, a ...any) { problems = append(problems, fmt.Sprintf(format, a...)) }

	if u, err := url.Parse(c.Origin); err == nil && localHost(u.Hostname()) {
		add("APP_ORIGIN must be a public host name, not %s", u.Hostname())
	}
	if mk := env("MAIL_KEY_FILE"); mk == "" || !filepath.IsAbs(mk) {
		add("MAIL_KEY_FILE must be an absolute mounted secret path")
	}
	if env("DB_USER") == "calirestore_migrator" {
		add("DB_USER must be the application role, not the migration role")
	}
	if env("DB_SSLMODE") == "disable" && !privateHost(env("DB_HOST")) {
		add("DB_SSLMODE=disable is only allowed for a private-network DB_HOST; use verify-full")
	}
	if role == "worker" || role == "check-config" {
		address, from := env("SMTP_ADDRESS"), env("SMTP_FROM")
		host, _, err := net.SplitHostPort(address)
		switch {
		case address == "" || err != nil:
			add("SMTP_ADDRESS must be host:port of a mail relay")
		case host == "mail-sink" || localHost(host):
			add("SMTP_ADDRESS must be a real relay, not the development mail sink")
		}
		if a, err := mail.ParseAddress(from); err != nil {
			add("SMTP_FROM must be a valid sender address")
		} else if d := a.Address[strings.LastIndex(a.Address, "@")+1:]; d == "invalid" || strings.HasSuffix(d, ".invalid") || localHost(d) {
			add("SMTP_FROM must use a real sender domain")
		}
		if env("SMTP_USERNAME") != "" && env("SMTP_PASSWORD_FILE") == "" {
			add("SMTP_USERNAME requires SMTP_PASSWORD_FILE")
		}
		if p := env("SMTP_PASSWORD_FILE"); p != "" && !filepath.IsAbs(p) {
			add("SMTP_PASSWORD_FILE must be an absolute mounted secret path")
		}
	}
	if len(problems) > 0 {
		return errors.New("unsafe production configuration: " + strings.Join(problems, "; "))
	}
	return nil
}

func localHost(h string) bool {
	h = strings.ToLower(strings.TrimSuffix(h, "."))
	if h == "localhost" || strings.HasSuffix(h, ".localhost") || strings.HasSuffix(h, ".test") || strings.HasSuffix(h, ".invalid") {
		return true
	}
	ip := net.ParseIP(h)
	return ip != nil && (ip.IsLoopback() || ip.IsUnspecified())
}

// privateHost reports whether a database host is a Compose-style single-label
// service name, or a loopback or private-range address.
func privateHost(h string) bool {
	if h == "" {
		h = "db"
	}
	if ip := net.ParseIP(h); ip != nil {
		return ip.IsLoopback() || ip.IsPrivate()
	}
	return !strings.Contains(h, ".")
}
