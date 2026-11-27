package orgs

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/sicza95/cali-restore-pro/server/internal/identity"
)

// Summary is one organisation in the account's list.
type Summary struct {
	ID       string    `json:"id"`
	Name     string    `json:"name"`
	Personal bool      `json:"personal"`
	Role     string    `json:"role"`
	Count    int       `json:"memberCount"`
	Defaults *Defaults `json:"defaults,omitempty"`
}

// Invitation is an invitation addressed to the signed-in account.
type Invitation struct {
	ID           string    `json:"id"`
	Organisation string    `json:"organisation"`
	Name         string    `json:"name"`
	Role         string    `json:"role"`
	InvitedBy    string    `json:"invitedBy"`
	ExpiresAt    time.Time `json:"expiresAt"`
}

type Member struct {
	ID     string   `json:"id"`
	Name   string   `json:"name"`
	Email  string   `json:"email"`
	Role   string   `json:"role"`
	Groups []string `json:"groups"`
}

// SentInvitation is a pending invitation, as its organisation's admins see it.
type SentInvitation struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	Groups    []string  `json:"groups"`
	ExpiresAt time.Time `json:"expiresAt"`
}

type Detail struct {
	Summary
	Members     []Member         `json:"members"`
	Groups      []Group          `json:"groups"`
	Invitations []SentInvitation `json:"invitations"`
	Projects    int              `json:"projects"`
}

// Overview is the account's organisations and the invitations waiting for it.
type Overview struct {
	Organisations []Summary    `json:"organisations"`
	Invitations   []Invitation `json:"invitations"`
}

func (s *Service) Overview(ctx context.Context, raw string) (Overview, error) {
	out := Overview{Organisations: []Summary{}, Invitations: []Invitation{}}
	err := s.with(ctx, raw, func(a access) error {
		rows, err := a.tx.Query(ctx, `SELECT o.id::text,o.name,o.personal,m.role,
 (SELECT count(*)::int FROM organisation_members x WHERE x.organisation_id=o.id),o.defaults
 FROM organisation_members m JOIN organisations o ON o.id=m.organisation_id
 WHERE m.account_id=$1 ORDER BY o.personal DESC, lower(o.name), o.id`, a.account)
		if err != nil {
			return err
		}
		if out.Organisations, err = pgx.CollectRows(rows, pgx.RowToStructByPos[Summary]); err != nil {
			return err
		}
		rows, err = a.tx.Query(ctx, `SELECT i.id::text,o.id::text,o.name,i.role,coalesce(nullif(b.full_name,''),b.email,''),i.expires_at
 FROM organisation_invitations i JOIN organisations o ON o.id=i.organisation_id LEFT JOIN accounts b ON b.id=i.invited_by
 WHERE i.email=$1 AND i.expires_at>clock_timestamp()
 AND NOT EXISTS (SELECT 1 FROM organisation_members m WHERE m.organisation_id=o.id AND m.account_id=$2)
 ORDER BY i.created_at`, a.email, a.account)
		if err != nil {
			return err
		}
		out.Invitations, err = pgx.CollectRows(rows, pgx.RowToStructByPos[Invitation])
		return err
	})
	return out, err
}

func (s *Service) Detail(ctx context.Context, raw, org string) (Detail, error) {
	var d Detail
	err := s.with(ctx, raw, func(a access) error {
		role, personal, err := a.role(ctx, org, false)
		if err != nil {
			return err
		}
		d.ID, d.Role, d.Personal = org, role, personal
		if err := a.tx.QueryRow(ctx, `SELECT name,(SELECT count(*)::int FROM organisation_members WHERE organisation_id=$1),
 (SELECT count(*)::int FROM hosted_projects WHERE organisation_id=$1) FROM organisations WHERE id=$1`, org).
			Scan(&d.Name, &d.Count, &d.Projects); err != nil {
			return err
		}
		if err := a.tx.QueryRow(ctx, `SELECT defaults FROM organisations WHERE id=$1`, org).Scan(&d.Defaults); err != nil {
			return err
		}
		rows, err := a.tx.Query(ctx, `SELECT a.id::text,a.full_name,a.email,m.role,
 coalesce(array(SELECT g.group_id::text FROM organisation_member_groups g WHERE g.organisation_id=m.organisation_id AND g.account_id=m.account_id ORDER BY g.group_id),'{}')
 FROM organisation_members m JOIN accounts a ON a.id=m.account_id
 WHERE m.organisation_id=$1 ORDER BY m.role, lower(coalesce(nullif(a.full_name,''),a.email))`, org)
		if err != nil {
			return err
		}
		if d.Members, err = pgx.CollectRows(rows, pgx.RowToStructByPos[Member]); err != nil {
			return err
		}
		if d.Groups, err = a.groups(ctx, org); err != nil {
			return err
		}
		d.Invitations = []SentInvitation{}
		if role != "admin" {
			return nil
		}
		rows, err = a.tx.Query(ctx, `SELECT id::text,email,role,coalesce(array(SELECT unnest(groups)::text),'{}'),expires_at
 FROM organisation_invitations WHERE organisation_id=$1 AND expires_at>clock_timestamp() ORDER BY created_at`, org)
		if err != nil {
			return err
		}
		d.Invitations, err = pgx.CollectRows(rows, pgx.RowToStructByPos[SentInvitation])
		return err
	})
	return d, err
}

func (a access) groups(ctx context.Context, org string) ([]Group, error) {
	rows, err := a.tx.Query(ctx, `SELECT id::text,name,sections,actions,all_projects FROM organisation_groups
 WHERE organisation_id=$1 ORDER BY position,id`, org)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Group, error) {
		var g Group
		var raw []byte
		err := row.Scan(&g.ID, &g.Name, &raw, &g.Actions, &g.AllProjects)
		if err == nil {
			err = json.Unmarshal(raw, &g.Sections)
		}
		return g, err
	})
}

func orgName(name string) (string, bool) {
	name = strings.Join(strings.Fields(name), " ")
	return name, name != "" && len([]rune(name)) <= maxOrgName
}

// Create makes a shared organisation with the account as its admin and the
// starter groups in the given language.
func (s *Service) Create(ctx context.Context, raw, name, lang string) (string, error) {
	name, ok := orgName(name)
	if !ok {
		return "", identity.ErrInvalid
	}
	var id string
	err := s.with(ctx, raw, func(a access) error {
		var count int
		if err := a.tx.QueryRow(ctx, `SELECT count(*) FROM organisation_members m JOIN organisations o ON o.id=m.organisation_id
 WHERE m.account_id=$1 AND m.role='admin' AND NOT o.personal`, a.account).Scan(&count); err != nil {
			return err
		}
		if count >= maxAdminOrgs {
			return errTooMany
		}
		if err := a.tx.QueryRow(ctx, `INSERT INTO organisations(name) VALUES($1) RETURNING id::text`, name).Scan(&id); err != nil {
			return err
		}
		if _, err := a.tx.Exec(ctx, `INSERT INTO organisation_members(organisation_id,account_id,role) VALUES($1,$2,'admin')`, id, a.account); err != nil {
			return err
		}
		for i, g := range starterGroups(lang) {
			if _, err := a.insertGroup(ctx, id, g, i); err != nil {
				return err
			}
		}
		return a.changed(ctx, id)
	})
	return id, err
}

func (a access) insertGroup(ctx context.Context, org string, g Group, position int) (string, error) {
	sections, err := json.Marshal(g.Sections)
	if err != nil {
		return "", err
	}
	var id string
	err = a.tx.QueryRow(ctx, `INSERT INTO organisation_groups(organisation_id,name,sections,actions,all_projects,position)
 VALUES($1,$2,$3,$4,$5,$6) RETURNING id::text`, org, g.Name, sections, g.Actions, g.AllProjects, position).Scan(&id)
	return id, err
}

func (s *Service) Rename(ctx context.Context, raw, org, name string) error {
	name, ok := orgName(name)
	if !ok {
		return identity.ErrInvalid
	}
	return s.with(ctx, raw, func(a access) error {
		if err := a.admin(ctx, org); err != nil {
			return err
		}
		if _, err := a.tx.Exec(ctx, `UPDATE organisations SET name=$2 WHERE id=$1`, org, name); err != nil {
			return err
		}
		return a.changed(ctx, org)
	})
}

// Delete removes a shared organisation. Its hosted projects must move or be
// deleted first, so no project is left without an organisation.
func (s *Service) Delete(ctx context.Context, raw, org string) error {
	return s.with(ctx, raw, func(a access) error {
		if err := a.admin(ctx, org); err != nil {
			return err
		}
		var projects int
		if err := a.tx.QueryRow(ctx, `SELECT count(*) FROM hosted_projects WHERE organisation_id=$1`, org).Scan(&projects); err != nil {
			return err
		}
		if projects > 0 {
			return errHasProject
		}
		// Queued before the members go; delivered when the deletion commits.
		if err := a.tell(ctx, org, "deleted", "deleted"); err != nil {
			return err
		}
		_, err := a.tx.Exec(ctx, `DELETE FROM organisations WHERE id=$1`, org)
		return err
	})
}

// validGroups checks that every id is a group of the organisation.
func (a access) validGroups(ctx context.Context, org string, ids []string) error {
	if len(ids) > maxGroups {
		return identity.ErrInvalid
	}
	var found int
	err := a.tx.QueryRow(ctx, `SELECT count(DISTINCT id) FROM organisation_groups WHERE organisation_id=$1 AND id::text=ANY($2)`, org, ids).Scan(&found)
	if err == nil && found != len(ids) {
		return identity.ErrInvalid
	}
	return err
}

func (a access) setGroups(ctx context.Context, org, account string, ids []string) error {
	if _, err := a.tx.Exec(ctx, `DELETE FROM organisation_member_groups WHERE organisation_id=$1 AND account_id=$2`, org, account); err != nil {
		return err
	}
	_, err := a.tx.Exec(ctx, `INSERT INTO organisation_member_groups(organisation_id,account_id,group_id)
 SELECT $1,$2,unnest($3::uuid[])`, org, account, ids)
	return err
}

func validRole(role string) bool { return role == "admin" || role == "member" }

func uniqueIDs(ids []string) bool {
	seen := map[string]bool{}
	for _, id := range ids {
		if seen[id] {
			return false
		}
		seen[id] = true
	}
	return true
}
