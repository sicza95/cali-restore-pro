// Package live pushes small change notices to signed-in browsers. A change
// queues a notice with pg_notify inside its own transaction, so it is sent
// only if the change commits, and every API process hears it through one
// LISTEN connection. Browsers receive notices as Server-Sent Events and then
// re-read the data through the normal API; a notice carries no content.
package live

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const channel = "calirestore_live"

// maxStreams limits open streams per account (tabs and devices).
const maxStreams = 16

// Event is one notice for one account. Kind says what happened; the other
// fields name it for a message ("Anna joined Acme").
type Event struct {
	Account      string `json:"a"`
	Kind         string `json:"k"`
	Organisation string `json:"o,omitempty"`
	Name         string `json:"n,omitempty"`
	Who          string `json:"w,omitempty"`
}

// Notify queues e for delivery when tx commits.
func Notify(ctx context.Context, tx pgx.Tx, e Event) error {
	payload, err := json.Marshal(e)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `SELECT pg_notify($1,$2)`, channel, string(payload))
	return err
}

// NotifyEmail queues e for the active account with this email, if any.
func NotifyEmail(ctx context.Context, tx pgx.Tx, email string, e Event) error {
	err := tx.QueryRow(ctx, `SELECT id::text FROM accounts WHERE email=$1 AND state='active'`, email).Scan(&e.Account)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	return Notify(ctx, tx, e)
}

// NotifyOrganisation queues a notice for every member of org: adminKind for
// admins and memberKind for members, except actor, who gets "changed" (other
// tabs refresh without a message about one's own action).
func NotifyOrganisation(ctx context.Context, tx pgx.Tx, org, actor, adminKind, memberKind string, e Event) error {
	e.Organisation = org
	payload, err := json.Marshal(e)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `SELECT pg_notify($1, (($2::jsonb) || jsonb_build_object('a',account_id::text,'k',
 CASE WHEN account_id::text=$4 THEN 'changed' WHEN role='admin' THEN $5 ELSE $6 END))::text)
 FROM organisation_members WHERE organisation_id=$3`, channel, string(payload), org, actor, adminKind, memberKind)
	return err
}

// Hub delivers notices to the streams of each account.
type Hub struct {
	mu      sync.Mutex
	streams map[string]map[chan Event]struct{}
	done    chan struct{}
	closed  bool
	ready   chan struct{}
}

func NewHub() *Hub {
	return &Hub{streams: map[string]map[chan Event]struct{}{}, done: make(chan struct{}), ready: make(chan struct{})}
}

// Ready is closed once the hub first listens for notices.
func (h *Hub) Ready() <-chan struct{} { return h.ready }

// Close ends every stream; the server calls it when it shuts down.
func (h *Hub) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	if !h.closed {
		h.closed = true
		close(h.done)
	}
}

func (h *Hub) subscribe(account string) (chan Event, func(), bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed || len(h.streams[account]) >= maxStreams {
		return nil, nil, false
	}
	stream := make(chan Event, 8)
	if h.streams[account] == nil {
		h.streams[account] = map[chan Event]struct{}{}
	}
	h.streams[account][stream] = struct{}{}
	return stream, func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		delete(h.streams[account], stream)
		if len(h.streams[account]) == 0 {
			delete(h.streams, account)
		}
	}, true
}

// publish hands e to every stream of its account, or of every account when
// Account is empty. A stream that is behind skips it: the browser re-reads
// everything on the next notice anyway.
func (h *Hub) publish(e Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for account, streams := range h.streams {
		if e.Account != "" && account != e.Account {
			continue
		}
		for stream := range streams {
			select {
			case stream <- e:
			default:
			}
		}
	}
}

// Run listens for notices until ctx ends, reconnecting after a failure. After
// a reconnect every stream is told to re-read, since notices may have been
// missed meanwhile.
func (h *Hub) Run(ctx context.Context, pool *pgxpool.Pool) {
	first := true
	for ctx.Err() == nil {
		err := h.listen(ctx, pool, func() {
			if first {
				close(h.ready)
			} else {
				h.publish(Event{Kind: "changed"})
			}
			first = false
		})
		if ctx.Err() != nil {
			return
		}
		slog.Warn("live notices interrupted; reconnecting", "error", err)
		select {
		case <-ctx.Done():
		case <-time.After(2 * time.Second):
		}
	}
}

func (h *Hub) listen(ctx context.Context, pool *pgxpool.Pool, ready func()) error {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return err
	}
	// The listening connection never goes back to the pool.
	raw := conn.Hijack()
	defer raw.Close(context.Background())
	if _, err := raw.Exec(ctx, "LISTEN "+channel); err != nil {
		return err
	}
	ready()
	for {
		n, err := raw.WaitForNotification(ctx)
		if err != nil {
			return err
		}
		var e Event
		if json.Unmarshal([]byte(n.Payload), &e) == nil && e.Account != "" {
			h.publish(e)
		}
	}
}
