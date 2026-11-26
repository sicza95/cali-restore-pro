package projects

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/sicza95/cali-restore-pro/server/internal/live"
	"github.com/sicza95/cali-restore-pro/server/internal/orgs"
)

func TestPostgresProjectVisibilityNotices(t *testing.T) {
	f := newVisibilityFixture(t)
	ctx := context.Background()
	listener, err := f.admin.Acquire(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Release()
	if _, err := listener.Exec(ctx, "LISTEN calirestore_live"); err != nil {
		t.Fatal(err)
	}
	// A marker behind each completed request lets us assert both delivery and
	// absence of notices without timing-based sleeps or polling.
	notices := func(want bool) {
		t.Helper()
		f.exec(`SELECT pg_notify('calirestore_live','test-barrier')`)
		wait, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		accounts := map[string]int{}
		for {
			n, err := listener.Conn().WaitForNotification(wait)
			if err != nil {
				t.Fatal(err)
			}
			if n.Payload == "test-barrier" {
				break
			}
			var e live.Event
			if err := json.Unmarshal([]byte(n.Payload), &e); err != nil {
				t.Fatal(err)
			}
			if e.Kind != "changed" || e.Organisation != f.org || e.Name != "" || e.Who != "" {
				t.Fatalf("unexpected directory notice: %+v", e)
			}
			accounts[e.Account]++
		}
		if want {
			if len(accounts) != 2 || accounts[f.owner] != 1 || accounts[f.other] != 1 {
				t.Fatalf("expected each org member once, not outside co-owner: %+v", accounts)
			}
		} else if len(accounts) != 0 {
			t.Fatalf("unchanged directory emitted notices: %+v", accounts)
		}
	}
	// Private metadata changes do not send directory notices.
	f.call("PATCH", f.owner, projectVisibility{"private", 1, "Private chapel"}, 200, nil)
	notices(false)
	f.call("PATCH", f.co, projectVisibility{"listed", 2, "Published chapel"}, 200, nil)
	notices(true)
	// A directory card does not grant access to revision content or visibility.
	f.call("GET", f.other, nil, 404, nil)
	r := f.request("GET", "/api/v1/hosted-projects/"+visibilityProject+"/revision", f.other, nil)
	r.Header.Set("X-Sync-Account", f.other)
	f.serve(r, 404, nil)
	f.call("PATCH", f.co, projectVisibility{"listed", 3, "Renamed chapel"}, 200, nil)
	notices(true)
	f.call("PATCH", f.owner, projectVisibility{"private", 3, "Stale"}, 409, nil)
	notices(false)
	f.call("PATCH", f.owner, projectVisibility{"listed", 4, "Renamed chapel"}, 200, nil)
	notices(false)
	f.call("PATCH", f.owner, projectVisibility{"private", 5, "Renamed chapel"}, 200, nil)
	notices(true)
	// Visibility PATCH metadata is what the directory publishes and unpublishes.
	orgs.NewHTTP(f.auth, orgs.New(f.app, nil)).Register(f.mux)
	var page struct {
		Projects []struct{ ID, Name string }
	}
	directory := "/api/v1/organisations/" + f.org + "/projects"
	f.serve(f.request("GET", directory, f.other, nil), 200, &page)
	if len(page.Projects) != 0 {
		t.Fatalf("unpublished project is listed: %+v", page)
	}
	f.call("PATCH", f.owner, projectVisibility{"listed", 6, "Final published name"}, 200, nil)
	f.serve(f.request("GET", directory, f.other, nil), 200, &page)
	if len(page.Projects) != 1 || page.Projects[0].ID != visibilityProject || page.Projects[0].Name != "Final published name" {
		t.Fatalf("directory did not use approved PATCH name: %+v", page)
	}
}
