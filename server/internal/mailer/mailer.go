// Package mailer renders account mail and sends it over SMTP.
package mailer

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"errors"
	"fmt"
	"mime"
	"mime/quotedprintable"
	"net"
	"net/smtp"
	"strings"
	"time"
)

// Transport sends one message with a plain-text and an HTML part.
type Transport func(ctx context.Context, to, subject, text, html string) error

// mimeBody builds multipart/alternative: text first, HTML last (preferred).
// Quoted-printable keeps every line within SMTP's length limit.
func mimeBody(text, html string) (string, string) {
	seed := make([]byte, 12)
	_, _ = rand.Read(seed)
	boundary := "cr-" + hex.EncodeToString(seed)
	var b bytes.Buffer
	for _, part := range []struct{ kind, body string }{{"text/plain", text}, {"text/html", html}} {
		fmt.Fprintf(&b, "--%s\r\nContent-Type: %s; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n", boundary, part.kind)
		w := quotedprintable.NewWriter(&b)
		_, _ = w.Write([]byte(strings.ReplaceAll(strings.ReplaceAll(part.body, "\r\n", "\n"), "\n", "\r\n")))
		_ = w.Close()
		b.WriteString("\r\n")
	}
	fmt.Fprintf(&b, "--%s--\r\n", boundary)
	return "multipart/alternative; boundary=\"" + boundary + "\"", b.String()
}

// SMTPTransport uses bounded network deadlines, STARTTLS in production, and
// optional credentials only after TLS. Development plaintext is for Mailpit.
func SMTPTransport(address, from, username, password string, requireTLS bool) Transport {
	return func(ctx context.Context, to, subject, text, html string) error {
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
		kind, body := mimeBody(text, html)
		_, err = fmt.Fprintf(w, "From: %s\r\nTo: %s\r\nSubject: %s\r\nDate: %s\r\nMIME-Version: 1.0\r\nContent-Type: %s\r\n\r\n%s", from, to, mime.QEncoding.Encode("utf-8", subject), time.Now().Format(time.RFC1123Z), kind, body)
		if err != nil {
			return err
		}
		if err = w.Close(); err != nil {
			return err
		}
		return client.Quit()
	}
}
