package live_test

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/sicza95/cali-restore-pro/server/internal/identity"
	"github.com/sicza95/cali-restore-pro/server/internal/identity/sessiontoken"
	"github.com/sicza95/cali-restore-pro/server/internal/live"
	"github.com/sicza95/cali-restore-pro/server/internal/orgs"
	"github.com/sicza95/cali-restore-pro/server/internal/testdb"
)

type notice struct{ Kind, Organisation, Name, Who string }

func TestPostgresLiveOrganisationNotices(t *testing.T) {
	admin, app := testdb.New(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ids, err := identity.New(app)
	if err != nil {
		t.Fatal(err)
	}
	const origin = "https://test.example"
	if err := ids.ConfigureMail(make([]byte, 32), origin); err != nil {
		t.Fatal(err)
	}
	auth := identity.NewHTTP(ids, origin, false)
	hub := live.NewHub()
	go hub.Run(ctx, app)
	select {
	case <-hub.Ready():
	case <-time.After(5 * time.Second):
		t.Fatal("hub never listened")
	}
	mux := http.NewServeMux()
	orgs.NewHTTP(auth, orgs.New(app, ids)).Register(mux)
	hub.Routes(auth, app)(mux)
	server := httptest.NewServer(mux)
	defer server.Close()
	defer hub.Close()

	account := func(email string) (id, raw string) {
		t.Helper()
		if err := admin.QueryRow(ctx, `INSERT INTO accounts(email,password_hash,state) VALUES ($1,'synthetic','active') RETURNING id`, email).Scan(&id); err != nil {
			t.Fatal(err)
		}
		raw = sessiontoken.New()
		if _, err := admin.Exec(ctx, `INSERT INTO sessions(account_id,token_digest) VALUES ($1,$2)`, id, sessiontoken.Digest(raw)); err != nil {
			t.Fatal(err)
		}
		return id, raw
	}
	request := func(method, path, raw string, body any) *http.Request {
		data, _ := json.Marshal(body)
		r, _ := http.NewRequestWithContext(ctx, method, server.URL+"/api/v1"+path, bytes.NewReader(data))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Origin", origin)
		r.Header.Set("X-CSRF-Token", sessiontoken.CSRF(raw))
		if raw != "" {
			r.AddCookie(&http.Cookie{Name: auth.CookieName(), Value: raw})
		}
		return r
	}
	call := func(method, path, raw string, body, out any) {
		t.Helper()
		response, err := http.DefaultClient.Do(request(method, path, raw, body))
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		if response.StatusCode != 200 {
			t.Fatalf("%s %s: %d", method, path, response.StatusCode)
		}
		if out != nil {
			_ = json.NewDecoder(response.Body).Decode(out)
		}
	}
	// stream opens the account's event stream and returns its notices.
	stream := func(raw string) <-chan notice {
		t.Helper()
		response, err := http.DefaultClient.Do(request("GET", "/events", raw, nil))
		if err != nil || response.StatusCode != 200 || response.Header.Get("Content-Type") != "text/event-stream" {
			t.Fatalf("event stream: %v %v", err, response)
		}
		notices := make(chan notice, 16)
		ready := make(chan struct{})
		go func() {
			defer response.Body.Close()
			lines := bufio.NewScanner(response.Body)
			for lines.Scan() {
				line := lines.Text()
				if line == ": ready" {
					close(ready)
				}
				if data, ok := strings.CutPrefix(line, "data: "); ok {
					var n notice
					_ = json.Unmarshal([]byte(data), &n)
					notices <- n
				}
			}
		}()
		<-ready
		return notices
	}
	expect := func(notices <-chan notice, kind string) notice {
		t.Helper()
		for {
			select {
			case n := <-notices:
				if n.Kind == kind {
					return n
				}
			case <-time.After(5 * time.Second):
				t.Fatalf("no %q notice", kind)
			}
		}
	}

	_, annaToken := account("anna@example.test")
	bobID, bobToken := account("bob@example.test")
	// Without a session there is no stream.
	if response, err := http.DefaultClient.Do(request("GET", "/events", "", nil)); err != nil || response.StatusCode != 401 {
		t.Fatalf("anonymous stream: %v %v", err, response)
	}
	anna, bob := stream(annaToken), stream(bobToken)
	var created struct{ ID string }
	call("POST", "/organisations", annaToken, map[string]string{"name": "Acme"}, &created)
	expect(anna, "changed")

	// The invitee hears of the invitation at once, with the organisation and who sent it.
	call("POST", "/organisations/"+created.ID+"/invitations", annaToken, map[string]any{"email": "bob@example.test", "role": "member"}, nil)
	if n := expect(bob, "invited"); n.Name != "Acme" || n.Who != "anna@example.test" || n.Organisation != created.ID {
		t.Fatalf("invited notice %+v", n)
	}
	var overview orgs.Overview
	call("GET", "/organisations", bobToken, nil, &overview)

	// The inviter hears the answer.
	call("POST", "/organisation-invitations/"+overview.Invitations[0].ID+"/accept", bobToken, struct{}{}, nil)
	if n := expect(anna, "accepted"); n.Who != "bob@example.test" || n.Name != "Acme" {
		t.Fatalf("accepted notice %+v", n)
	}
	expect(bob, "changed")

	// Removing someone tells them; a declined invitation tells the admins.
	call("DELETE", "/organisations/"+created.ID+"/members/"+bobID, annaToken, struct{}{}, nil)
	expect(bob, "removed")
	call("POST", "/organisations/"+created.ID+"/invitations", annaToken, map[string]any{"email": "bob@example.test", "role": "member"}, nil)
	expect(bob, "invited")
	call("GET", "/organisations", bobToken, nil, &overview)
	call("POST", "/organisation-invitations/"+overview.Invitations[0].ID+"/decline", bobToken, struct{}{}, nil)
	expect(anna, "declined")
}
