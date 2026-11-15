// Package mailer renders account mail and sends it over SMTP.
package mailer

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"mime"
	"net"
	"net/smtp"
	"strings"
	"time"
)

// Text contains no restoration/project information. Links use fragments,
// so browsers do not send the secret to proxies or static request logs.
func Text(p Payload, origin string) (string, string) {
	subject, body := "CaliRestore Pro account", "A security change was requested or completed for your account. If this was not you, reset your password or contact your operator."
	if p.Language == "hu" {
		subject = "CaliRestore Pro fiók"
		body = "Biztonsági módosítást kértek vagy hajtottak végre a fiókodban. Ha nem te voltál, állítsd vissza a jelszavad, vagy fordulj az üzemeltetőhöz."
	}
	route := "/verify-email"
	switch p.Purpose {
	case "project-invitation":
		subject = "CaliRestore Pro project invitation"
		body = "You received a project invitation. Sign in with this email address to review pending invitations."
		if p.Language == "hu" {
			subject = "CaliRestore Pro projektmeghívó"
			body = "Projektmeghívót kaptál. Jelentkezz be ezzel az e-mail-címmel a függő meghívók megtekintéséhez."
		}
		return subject, body + "\n\n" + origin + "/invitations"
	case "verify":
		body = "Verify your email address. This link is valid for 24 hours."
		if p.Language == "hu" {
			body = "Erősítsd meg az e-mail-címed. A hivatkozás 24 óráig érvényes."
		}
	case "reset":
		route = "/reset-password"
		body = "Reset your password. This link is valid for 30 minutes. Ignore this message if you did not request it."
		if p.Language == "hu" {
			body = "Állítsd vissza a jelszavad. A hivatkozás 30 percig érvényes. Ha nem te kérted, hagyd figyelmen kívül ezt a levelet."
		}
	case "email":
		route = "/confirm-email"
		body = "Confirm your new email address. This link is valid for 30 minutes."
		if p.Language == "hu" {
			body = "Erősítsd meg az új e-mail-címed. A hivatkozás 30 percig érvényes."
		}
	}
	if p.Token != "" {
		body += "\n\n" + origin + route + "#token=" + p.Token
	}
	return subject, body
}

type Payload struct{ To, Language, Purpose, Token string }

type Transport func(context.Context, string, string, string) error

// SMTPTransport uses bounded network deadlines, STARTTLS in production, and
// optional credentials only after TLS. Development plaintext is for Mailpit.
func SMTPTransport(address, from, username, password string, requireTLS bool) Transport {
	return func(ctx context.Context, to, subject, body string) error {
		if strings.ContainsAny(from+to, "\r\n") {
			return errors.New("invalid mail address")
		}
		host, _, err := net.SplitHostPort(address)
		if err != nil {
			return err
		}
		conn, err := (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, "tcp", address)
		if err != nil {
			return err
		}
		defer conn.Close()
		_ = conn.SetDeadline(time.Now().Add(8 * time.Second))
		client, err := smtp.NewClient(conn, host)
		if err != nil {
			return err
		}
		defer client.Close()
		if ok, _ := client.Extension("STARTTLS"); ok {
			if err = client.StartTLS(&tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}); err != nil {
				return err
			}
		} else if requireTLS || username != "" {
			return errors.New("SMTP TLS required")
		}
		if username != "" {
			if err = client.Auth(smtp.PlainAuth("", username, password, host)); err != nil {
				return err
			}
		}
		if err = client.Mail(from); err != nil {
			return err
		}
		if err = client.Rcpt(to); err != nil {
			return err
		}
		w, err := client.Data()
		if err != nil {
			return err
		}
		_, err = fmt.Fprintf(w, "From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n%s\r\n", from, to, mime.QEncoding.Encode("utf-8", subject), strings.ReplaceAll(body, "\n", "\r\n"))
		if err != nil {
			return err
		}
		if err = w.Close(); err != nil {
			return err
		}
		return client.Quit()
	}
}
