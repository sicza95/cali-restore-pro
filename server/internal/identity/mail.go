package identity

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"mime"
	"net"
	"net/smtp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// MailText contains no restoration/project information. Links use fragments,
// so browsers do not send the secret to proxies or static request logs.
func MailText(p mailPayload, origin string) (string, string) {
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

type MailTransport func(context.Context, string, string, string) error

// SMTPTransport uses bounded network deadlines, STARTTLS in production, and
// optional credentials only after TLS. Development plaintext is for Mailpit.
func SMTPTransport(address, from, username, password string, requireTLS bool) MailTransport {
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

// One job per call. A row lock is held through bounded SMTP delivery so multiple
// workers cannot concurrently send the same job. A crash after SMTP acceptance
// can duplicate a message: delivery is at-least-once, never exactly-once.
func (s *Service) DeliverMail(ctx context.Context, send MailTransport) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	if _, err = tx.Exec(ctx, `UPDATE mail_outbox SET status='failed',payload=NULL WHERE status='pending' AND expires_at<=clock_timestamp()`); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `DELETE FROM mail_outbox WHERE status<>'pending' AND created_at<now()-interval '7 days'`); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `DELETE FROM identity_links WHERE expires_at<=clock_timestamp()`); err != nil {
		return err
	}
	var id string
	var payload []byte
	var attempts int
	err = tx.QueryRow(ctx, `SELECT id,payload,attempts FROM mail_outbox WHERE status='pending' AND available_at<=clock_timestamp() AND expires_at>clock_timestamp() ORDER BY available_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`).Scan(&id, &payload, &attempts)
	if errors.Is(err, pgx.ErrNoRows) {
		return tx.Commit(ctx)
	}
	if err != nil {
		return err
	}
	var p mailPayload
	if s.mailCipher == nil {
		return errors.New("mail not configured")
	}
	n := s.mailCipher.NonceSize()
	if len(payload) < n {
		err = errors.New("invalid mail payload")
	} else {
		var plain []byte
		plain, err = s.mailCipher.Open(nil, payload[:n], payload[n:], []byte("calirestore-mail-v1"))
		if err == nil {
			err = json.Unmarshal(plain, &p)
		}
	}
	if err == nil {
		subject, body := MailText(p, s.origin)
		err = send(ctx, p.To, subject, body)
	}
	attempts++
	status := "sent"
	if err != nil {
		status = "pending"
		if attempts >= 8 {
			status = "failed"
		}
	}
	delay := time.Duration(1<<attempts) * time.Minute
	if delay > time.Hour {
		delay = time.Hour
	}
	if status != "pending" {
		payload = nil
	}
	if _, err = tx.Exec(ctx, `UPDATE mail_outbox SET attempts=$2,status=$3,payload=$4,available_at=$5 WHERE id=$1`, id, attempts, status, payload, time.Now().Add(delay)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
