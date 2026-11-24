package orgs

import "strings"

// Sections are the read unit of a project (plan §8.4). The list is fixed in
// the format; the app names them.
var sections = []string{"core", "client", "assessment", "photos", "scope-of-work", "pricing", "pricing-summary", "internal-notes", "admin"}

// summary is the published quote: read-only, written only by publishing.
const summary = "pricing-summary"

// Actions a group may allow. Logged ones are checked by the server once
// projects carry them; export is enforced by the app only.
var actions = []string{"members.manage", "project.settings", "estimate.publish", "photos.delete", "project.export"}

var levels = map[string]bool{"none": true, "read": true, "write": true}

const (
	maxGroups     = 50
	maxGroupName  = 60
	maxOrgName    = 100
	maxInvitesOut = 200
	maxAdminOrgs  = 50
)

// Group is a named permission set: none, read or write for every section, the
// allowed actions, and whether it applies to every project of the organisation.
type Group struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Sections    map[string]string `json:"sections"`
	Actions     []string          `json:"actions"`
	AllProjects bool              `json:"allProjects"`
}

// normalise checks a group as sent by an admin and fills in missing sections
// as "none". The quote summary is never written directly.
func (g Group) normalise() (Group, bool) {
	g.Name = strings.Join(strings.Fields(g.Name), " ")
	if g.Name == "" || len([]rune(g.Name)) > maxGroupName {
		return g, false
	}
	known := make(map[string]bool, len(sections))
	for _, s := range sections {
		known[s] = true
	}
	out := make(map[string]string, len(sections))
	for s, level := range g.Sections {
		if !known[s] || !levels[level] {
			return g, false
		}
	}
	for _, s := range sections {
		level := g.Sections[s]
		if level == "" {
			level = "none"
		}
		out[s] = level
	}
	if out[summary] == "write" {
		return g, false
	}
	// Every pricing reader also reads the published quote.
	if out["pricing"] != "none" && out[summary] == "none" {
		out[summary] = "read"
	}
	g.Sections = out
	seen := map[string]bool{}
	allowed := []string{}
	for _, a := range actions {
		for _, asked := range g.Actions {
			if asked == a && !seen[a] {
				seen[a] = true
				allowed = append(allowed, a)
			}
		}
	}
	if len(allowed) != len(g.Actions) {
		return g, false
	}
	g.Actions = allowed
	return g, true
}

func levelsOf(base string, overrides map[string]string) map[string]string {
	out := make(map[string]string, len(sections))
	for _, s := range sections {
		out[s] = base
	}
	if base == "write" {
		out[summary] = "read"
	}
	for s, l := range overrides {
		out[s] = l
	}
	return out
}

// starterGroups are copied into every new organisation, which may change them
// and add its own. Names follow the creator's language.
func starterGroups(lang string) []Group {
	hu := lang == "hu"
	name := func(en, hungarian string) string {
		if hu {
			return hungarian
		}
		return en
	}
	return []Group{
		{Name: name("Estimator", "Költségbecslő"), Sections: levelsOf("read", map[string]string{"core": "write", "assessment": "write", "photos": "write", "scope-of-work": "write", "pricing": "write", "admin": "none"}), Actions: []string{"estimate.publish", "project.export"}},
		{Name: name("Project manager", "Projektvezető"), Sections: levelsOf("write", map[string]string{"admin": "none"}), Actions: []string{"members.manage", "photos.delete", "project.export"}},
		{Name: name("Field technician", "Helyszíni technikus"), Sections: levelsOf("none", map[string]string{"core": "read", "client": "read", "assessment": "write", "photos": "write", "scope-of-work": "read", "internal-notes": "write"}), Actions: []string{}},
		{Name: name("Subcontractor", "Alvállalkozó"), Sections: levelsOf("none", map[string]string{"core": "read", "assessment": "read", "photos": "write", "scope-of-work": "read"}), Actions: []string{}},
		{Name: name("Adjuster (read only)", "Kárszakértő (csak olvasás)"), Sections: levelsOf("read", map[string]string{"pricing": "none", "internal-notes": "none", "admin": "none"}), Actions: []string{}},
		{Name: name("Client", "Ügyfél"), Sections: levelsOf("none", map[string]string{"core": "read", "photos": "read", summary: "read"}), Actions: []string{}},
	}
}
