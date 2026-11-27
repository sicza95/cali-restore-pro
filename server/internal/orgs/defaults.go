package orgs

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"image/png"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/sicza95/cali-restore-pro/server/internal/identity"
)

// Defaults belong to the organisation. Drawing snap remains an account preference.
type Defaults struct {
	Restoration Restoration `json:"restoration"`
	Branding    Branding    `json:"branding"`
}

type Restoration struct {
	Units          string  `json:"units"`
	AreaUnit       *string `json:"areaUnit"`
	Currency       string  `json:"currency"`
	ReportLanguage string  `json:"reportLanguage"`
}

type Branding struct {
	Studio  string `json:"studio"`
	Contact string `json:"contact"`
	Footer  string `json:"footer"`
	Accent  string `json:"accent"`
	Logo    string `json:"logo"`
}

// Initial is used only when nothing has been saved, to preserve old Personal preferences.
type DefaultsPatch struct {
	Restoration map[string]json.RawMessage `json:"restoration,omitempty"`
	Branding    map[string]json.RawMessage `json:"branding,omitempty"`
	Initial     *Defaults                  `json:"initial,omitempty"`
}

func baseDefaults() Defaults {
	return Defaults{Restoration: Restoration{Units: "metric", Currency: "HUF", ReportLanguage: "en"}, Branding: Branding{Accent: "#000000"}}
}

var accentPattern = regexp.MustCompile(`^#[a-fA-F0-9]{6}$`)
var currencyPattern = regexp.MustCompile(`^[A-Z]{3}$`)

func (d Defaults) valid() bool {
	r, b := d.Restoration, d.Branding
	if strings.ContainsRune(b.Studio+b.Contact+b.Footer, '\x00') {
		return false
	}
	if r.Units != "metric" && r.Units != "imperial" || !currencyPattern.MatchString(r.Currency) ||
		(r.ReportLanguage != "en" && r.ReportLanguage != "hu") || !accentPattern.MatchString(b.Accent) {
		return false
	}
	if r.AreaUnit != nil && *r.AreaUnit != "cm²" && *r.AreaUnit != "m²" && *r.AreaUnit != "in²" && *r.AreaUnit != "ft²" {
		return false
	}
	if utf8.RuneCountInString(b.Studio) > 120 || utf8.RuneCountInString(b.Contact) > 254 || utf8.RuneCountInString(b.Footer) > 240 {
		return false
	}
	if b.Logo == "" {
		return true
	}
	const prefix = "data:image/png;base64,"
	if !strings.HasPrefix(b.Logo, prefix) || len(b.Logo) > 350000 {
		return false
	}
	data, err := base64.StdEncoding.Strict().DecodeString(strings.TrimPrefix(b.Logo, prefix))
	if err != nil || len(data) > 262144 {
		return false
	}
	config, err := png.DecodeConfig(bytes.NewReader(data))
	return err == nil && config.Width <= 8192 && config.Height <= 8192
}

func mergeFields(target any, patch map[string]json.RawMessage, allowed ...string) error {
	raw, _ := json.Marshal(target)
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return err
	}
	for key, value := range patch {
		found := false
		for _, name := range allowed {
			if key == name {
				found = true
				break
			}
		}
		if !found || (bytes.Equal(bytes.TrimSpace(value), []byte("null")) && key != "areaUnit") {
			return identity.ErrInvalid
		}
		fields[key] = value
	}
	raw, _ = json.Marshal(fields)
	if err := json.Unmarshal(raw, target); err != nil {
		return identity.ErrInvalid
	}
	return nil
}

// UpdateDefaults serialises patches with member changes, preserving unrelated fields.
// Personal organisations have an admin too; only membership/rename operations exclude them.
func (s *Service) UpdateDefaults(ctx context.Context, raw, org string, patch DefaultsPatch) error {
	return s.with(ctx, raw, func(a access) error {
		role, personal, err := a.role(ctx, org, true)
		if err != nil {
			return err
		}
		if role != "admin" {
			return identity.ErrForbidden
		}
		var saved *Defaults
		if err := a.tx.QueryRow(ctx, `SELECT defaults FROM organisations WHERE id=$1`, org).Scan(&saved); err != nil {
			return err
		}
		next := baseDefaults()
		if saved != nil {
			next = *saved
		} else if personal && patch.Initial != nil {
			next = *patch.Initial
		}
		if len(patch.Restoration)+len(patch.Branding) == 0 {
			return identity.ErrInvalid
		}
		if err := mergeFields(&next.Restoration, patch.Restoration, "units", "areaUnit", "currency", "reportLanguage"); err != nil {
			return err
		}
		if err := mergeFields(&next.Branding, patch.Branding, "studio", "contact", "footer", "accent", "logo"); err != nil {
			return err
		}
		if !next.valid() {
			return identity.ErrInvalid
		}
		if _, err := a.tx.Exec(ctx, `UPDATE organisations SET defaults=$2 WHERE id=$1`, org, next); err != nil {
			return err
		}
		return a.changed(ctx, org)
	})
}
