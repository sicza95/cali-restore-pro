package identity

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/sicza95/cali-restore-pro/server/internal/mailer"
)

// One job per call. A row lock is held through bounded SMTP delivery so multiple
// workers cannot concurrently send the same job. A crash after SMTP acceptance
// can duplicate a message: delivery is at-least-once, never exactly-once.
func (s *Service) DeliverMail(ctx context.Context, send mailer.Transport) error {
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
	var p mailer.Payload
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
		subject, text := mailer.Text(p, s.origin)
		err = send(ctx, p.To, subject, text, mailer.HTML(p, s.origin))
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
