package orgs

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"

	"github.com/sicza95/cali-restore-pro/server/internal/identity"
	"github.com/sicza95/cali-restore-pro/server/internal/identity/sessiontoken"
	"github.com/sicza95/cali-restore-pro/server/internal/testdb"
)

func TestDefaultsValidation(t *testing.T) {
	good := baseDefaults()
	if !good.valid() {
		t.Fatal("base defaults invalid")
	}
	for _, patch := range []DefaultsPatch{
		{Restoration: map[string]json.RawMessage{"snap": json.RawMessage(`true`)}},
		{Restoration: map[string]json.RawMessage{"units": json.RawMessage(`null`)}},
		{Restoration: map[string]json.RawMessage{"areaUnit": json.RawMessage(`"acre"`)}},
		{Branding: map[string]json.RawMessage{"logo": json.RawMessage(`"data:image/png;base64,eA=="`)}},
	} {
		next := good
		err := mergeFields(&next.Restoration, patch.Restoration, "units", "areaUnit", "currency", "reportLanguage")
		if err == nil {
			err = mergeFields(&next.Branding, patch.Branding, "studio", "contact", "footer", "accent", "logo")
		}
		if err == nil && next.valid() {
			t.Fatalf("accepted invalid patch %+v", patch)
		}
	}
}

func TestPostgresOrganisationDefaults(t *testing.T) {
	admin, pool := testdb.New(t)
	ctx := context.Background()
	accounts, err := identity.New(pool)
	if err != nil {
		t.Fatal(err)
	}
	s := New(pool, accounts)
	account := func(email string) (string, string) {
		t.Helper()
		var id string
		if err := admin.QueryRow(ctx, `INSERT INTO accounts(email,password_hash,state) VALUES($1,'synthetic','active') RETURNING id::text`, email).Scan(&id); err != nil {
			t.Fatal(err)
		}
		raw := sessiontoken.New()
		if _, err := admin.Exec(ctx, `INSERT INTO sessions(account_id,token_digest) VALUES($1,$2)`, id, sessiontoken.Digest(raw)); err != nil {
			t.Fatal(err)
		}
		return id, raw
	}
	ownerID, owner := account("owner@example.test")
	memberID, member := account("member@example.test")
	_, outsider := account("outsider@example.test")
	overview, err := s.Overview(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	personal := overview.Organisations[0].ID
	team, err := s.Create(ctx, owner, "Team", "en")
	if err != nil {
		t.Fatal(err)
	}
	initial := baseDefaults()
	initial.Branding.Studio = "Personal studio"
	patch := DefaultsPatch{Initial: &initial, Restoration: map[string]json.RawMessage{"currency": json.RawMessage(`"EUR"`)}}
	if err := s.UpdateDefaults(ctx, owner, personal, patch); err != nil {
		t.Fatal(err)
	}
	// A Personal seed cannot leak into a shared organisation.
	if err := s.UpdateDefaults(ctx, owner, team, patch); err != nil {
		t.Fatal(err)
	}
	shared, err := s.Detail(ctx, owner, team)
	if err != nil || shared.Defaults == nil || shared.Defaults.Branding.Studio != "" || shared.Defaults.Restoration.Currency != "EUR" {
		t.Fatalf("shared defaults %+v %v", shared.Defaults, err)
	}
	if _, err := admin.Exec(ctx, `INSERT INTO organisation_members(organisation_id,account_id,role) VALUES($1,$2,'member')`, team, memberID); err != nil {
		t.Fatal(err)
	}
	if err := s.UpdateDefaults(ctx, member, team, patch); !errors.Is(err, identity.ErrForbidden) {
		t.Fatalf("member changed defaults: %v", err)
	}
	if err := s.UpdateDefaults(ctx, outsider, team, patch); !errors.Is(err, errNotFound) {
		t.Fatalf("outsider changed defaults: %v", err)
	}
	if _, err := s.Detail(ctx, outsider, personal); !errors.Is(err, errNotFound) {
		t.Fatalf("outsider read Personal: %v", err)
	}
	if detail, err := s.Detail(ctx, member, team); err != nil || detail.Defaults.Restoration.Currency != "EUR" {
		t.Fatalf("member read failed %v", err)
	}
	// Serialised field patches preserve concurrent edits to separate settings.
	patches := []DefaultsPatch{
		{Branding: map[string]json.RawMessage{"studio": json.RawMessage(`"Team studio"`)}},
		{Restoration: map[string]json.RawMessage{"currency": json.RawMessage(`"USD"`)}},
	}
	var wg sync.WaitGroup
	for _, change := range patches {
		wg.Go(func() {
			if err := s.UpdateDefaults(ctx, owner, team, change); err != nil {
				t.Error(err)
			}
		})
	}
	wg.Wait()
	shared, err = s.Detail(ctx, owner, team)
	if err != nil || shared.Defaults.Branding.Studio != "Team studio" || shared.Defaults.Restoration.Currency != "USD" {
		t.Fatalf("lost update %+v %v", shared.Defaults, err)
	}
	if err := s.UpdateDefaults(ctx, owner, team, DefaultsPatch{Restoration: map[string]json.RawMessage{"snap": json.RawMessage(`true`)}}); !errors.Is(err, identity.ErrInvalid) {
		t.Fatalf("accepted org snap: %v", err)
	}
	// Another old device cannot reseed already saved Personal values.
	initial.Branding.Studio = "Stale value"
	if err := s.UpdateDefaults(ctx, owner, personal, patch); err != nil {
		t.Fatal(err)
	}
	own, err := s.Detail(ctx, owner, personal)
	if err != nil || own.Defaults.Branding.Studio != "Personal studio" {
		t.Fatalf("reseeded Personal %+v %v", own.Defaults, err)
	}
	overview, err = s.Overview(ctx, owner)
	if err != nil || len(overview.Organisations) != 2 || overview.Organisations[0].Defaults == nil {
		t.Fatalf("overview lacks defaults %v", err)
	}
	if _, err := admin.Exec(ctx, `DELETE FROM accounts WHERE id=$1`, ownerID); err != nil {
		t.Fatal(err)
	}
	var cleared bool
	if err := admin.QueryRow(ctx, `SELECT defaults IS NULL FROM organisations WHERE id=$1`, personal).Scan(&cleared); err != nil || !cleared {
		t.Fatalf("Personal defaults retained after purge: %v", err)
	}
}
