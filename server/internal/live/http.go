package live

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sicza95/cali-restore-pro/server/internal/httpjson"
	"github.com/sicza95/cali-restore-pro/server/internal/identity"
)

// heartbeat keeps proxies from closing a quiet stream and rechecks the
// session, so a stream ends soon after sign-out or account suspension.
var heartbeat = 25 * time.Second

// Routes adds GET /api/v1/events: a Server-Sent Events stream of the signed-in
// account's notices. It does not use the Guard, whose 10 s budget would end
// the stream; it applies the same cross-site rule itself. Reading needs no
// CSRF token, and a notice reveals nothing the account cannot read anyway.
func (h *Hub) Routes(auth *identity.HTTP, pool *pgxpool.Pool) func(*http.ServeMux) {
	return func(mux *http.ServeMux) {
		mux.HandleFunc("GET /api/v1/events", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Cache-Control", "no-store")
			if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
				identity.Failure(w, identity.ErrForbidden)
				return
			}
			raw := auth.Token(r)
			check := func() (identity.Session, error) {
				ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
				defer cancel()
				return identity.LookupSession(ctx, pool, raw)
			}
			session, err := check()
			if err != nil {
				identity.Failure(w, err)
				return
			}
			stream, unsubscribe, ok := h.subscribe(session.Account.ID)
			if !ok {
				httpjson.Respond(w, 429, map[string]string{"error": "try_later"})
				return
			}
			defer unsubscribe()
			w.Header().Set("Content-Type", "text/event-stream")
			w.Header().Set("X-Accel-Buffering", "no")
			w.WriteHeader(http.StatusOK)
			control := http.NewResponseController(w)
			send := func(text string) bool {
				// The server's write timeout is for ordinary requests; a stream
				// extends it for each write instead.
				_ = control.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if _, err := io.WriteString(w, text); err != nil {
					return false
				}
				return control.Flush() == nil
			}
			// Browsers wait 5 s before reconnecting a dropped stream.
			if !send("retry: 5000\n: ready\n\n") {
				return
			}
			ticker := time.NewTicker(heartbeat)
			defer ticker.Stop()
			for {
				select {
				case <-r.Context().Done():
					return
				case <-h.done:
					return
				case e := <-stream:
					data, _ := json.Marshal(map[string]string{
						"kind": e.Kind, "organisation": e.Organisation, "name": e.Name, "who": e.Who,
					})
					if !send("event: organisations\ndata: " + string(data) + "\n\n") {
						return
					}
				case <-ticker.C:
					if _, err := check(); errors.Is(err, identity.ErrUnauthorized) {
						return
					}
					if !send(": ping\n\n") {
						return
					}
				}
			}
		})
	}
}
