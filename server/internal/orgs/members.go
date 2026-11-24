package orgs

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/sicza95/cali-restore-pro/server/internal/identity"
	"github.com/sicza95/cali-restore-pro/server/internal/live"
)

// Invite invites an email address with a role and groups. The answer is the
// same whether or not the address has an account; only an account that
// exists gets an email now, and an address that signs up later finds the
// invitation in its Organisations page.
func (s *Service) Invite(ctx context.Context, raw, org, email, role string, groups []string) error {
	email, ok := identity.NormalizeEmail(email)
	if !ok || !validRole(role) || !uniqueIDs(groups) {
		return identity.ErrInvalid
	}
	return s.with(ctx, raw, func(a access) error {
		if err := a.admin(ctx, org); err != nil {
			return err
		}
		if err := a.validGroups(ctx, org, groups); err != nil {
			return err
		}
		var member int
		err := a.tx.QueryRow(ctx, `SELECT 1 FROM organisation_members m JOIN accounts x ON x.id=m.account_id
 WHERE m.organisation_id=$1 AND x.email=$2`, org, email).Scan(&member)
		if err == nil {
			return errMember
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		var pending int
		if err := a.tx.QueryRow(ctx, `SELECT count(*) FROM organisation_invitations WHERE organisation_id=$1`, org).Scan(&pending); err != nil {
			return err
		}
		if pending >= maxInvitesOut {
			return errTooMany
		}
		var expires time.Time
		if err := a.tx.QueryRow(ctx, `INSERT INTO organisation_invitations(organisation_id,email,role,groups,invited_by)
 VALUES($1,$2,$3,$4::uuid[],$5)
 ON CONFLICT (organisation_id,email) DO UPDATE SET role=EXCLUDED.role,groups=EXCLUDED.groups,invited_by=EXCLUDED.invited_by,
 created_at=clock_timestamp(),expires_at=clock_timestamp()+interval '14 days'
 RETURNING expires_at`, org, email, role, groups, a.account).Scan(&expires); err != nil {
			return err
		}
		if err := a.changed(ctx, org); err != nil {
			return err
		}
		var recipient, lang, name string
		err = a.tx.QueryRow(ctx, `SELECT a.id::text,a.language,o.name FROM accounts a, organisations o
 WHERE a.email=$1 AND a.state='active' AND o.id=$2`, email, org).Scan(&recipient, &lang, &name)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		if err := live.Notify(ctx, a.tx, live.Event{Account: recipient, Kind: "invited", Organisation: org, Name: name, Who: a.who()}); err != nil {
			return err
		}
		return s.accounts.Enqueue(ctx, a.tx, recipient, email, lang, "organisation-invitation", "", expires)
	})
}

func (s *Service) CancelInvitation(ctx context.Context, raw, org, id string) error {
	return s.with(ctx, raw, func(a access) error {
		if err := a.admin(ctx, org); err != nil {
			return err
		}
		var email string
		err := a.tx.QueryRow(ctx, `DELETE FROM organisation_invitations WHERE organisation_id=$1 AND id=$2 RETURNING email`, org, id).Scan(&email)
		if errors.Is(err, pgx.ErrNoRows) {
			return errNotFound
		}
		if err != nil {
			return err
		}
		if err := live.NotifyEmail(ctx, a.tx, email, live.Event{Kind: "changed", Organisation: org}); err != nil {
			return err
		}
		return a.changed(ctx, org)
	})
}

// Answer accepts or declines an invitation addressed to the account's email.
func (s *Service) Answer(ctx context.Context, raw, id string, accept bool) error {
	return s.with(ctx, raw, func(a access) error {
		var org, role string
		var groups []string
		err := a.tx.QueryRow(ctx, `DELETE FROM organisation_invitations WHERE id=$1 AND email=$2 AND expires_at>clock_timestamp()
 RETURNING organisation_id::text,role,coalesce(array(SELECT unnest(groups)::text),'{}')`, id, a.email).Scan(&org, &role, &groups)
		if errors.Is(err, pgx.ErrNoRows) {
			return errNotFound
		}
		if err != nil {
			return err
		}
		// The account's other tabs refresh too.
		if err := live.Notify(ctx, a.tx, live.Event{Account: a.account, Kind: "changed", Organisation: org}); err != nil {
			return err
		}
		if !accept {
			return a.tell(ctx, org, "declined", "changed")
		}
		if _, err := a.tx.Exec(ctx, `SELECT 1 FROM organisations WHERE id=$1 FOR UPDATE`, org); err != nil {
			return err
		}
		tag, err := a.tx.Exec(ctx, `INSERT INTO organisation_members(organisation_id,account_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, org, a.account, role)
		if err != nil || tag.RowsAffected() == 0 {
			return err
		}
		// A group deleted since the invitation was sent is skipped.
		if _, err = a.tx.Exec(ctx, `INSERT INTO organisation_member_groups(organisation_id,account_id,group_id)
 SELECT $1,$2,g.id FROM organisation_groups g WHERE g.organisation_id=$1 AND g.id::text=ANY($3)`, org, a.account, groups); err != nil {
			return err
		}
		return a.tell(ctx, org, "accepted", "changed")
	})
}

// UpdateMember changes a member's role and groups. The organisation keeps at
// least one admin.
func (s *Service) UpdateMember(ctx context.Context, raw, org, member, role string, groups []string) error {
	if !validRole(role) || !uniqueIDs(groups) {
		return identity.ErrInvalid
	}
	return s.with(ctx, raw, func(a access) error {
		if err := a.admin(ctx, org); err != nil {
			return err
		}
		if err := a.validGroups(ctx, org, groups); err != nil {
			return err
		}
		tag, err := a.tx.Exec(ctx, `UPDATE organisation_members SET role=$3 WHERE organisation_id=$1 AND account_id=$2`, org, member, role)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return errNotFound
		}
		if err := a.keepsAdmin(ctx, org); err != nil {
			return err
		}
		if err := a.setGroups(ctx, org, member, groups); err != nil {
			return err
		}
		return a.changed(ctx, org)
	})
}

// RemoveMember takes a member out of the organisation. Anyone may leave; only
// admins remove others. The last admin cannot go.
func (s *Service) RemoveMember(ctx context.Context, raw, org, member string) error {
	return s.with(ctx, raw, func(a access) error {
		if member == a.account {
			_, personal, err := a.role(ctx, org, true)
			if err != nil {
				return err
			}
			if personal {
				return errPersonal
			}
		} else if err := a.admin(ctx, org); err != nil {
			return err
		}
		var name string
		if err := a.tx.QueryRow(ctx, `SELECT name FROM organisations WHERE id=$1`, org).Scan(&name); err != nil {
			return err
		}
		tag, err := a.tx.Exec(ctx, `DELETE FROM organisation_members WHERE organisation_id=$1 AND account_id=$2`, org, member)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return errNotFound
		}
		if err := a.keepsAdmin(ctx, org); err != nil {
			return err
		}
		if member == a.account {
			if err := live.Notify(ctx, a.tx, live.Event{Account: member, Kind: "changed", Organisation: org}); err != nil {
				return err
			}
			return a.tell(ctx, org, "left", "changed")
		}
		if err := live.Notify(ctx, a.tx, live.Event{Account: member, Kind: "removed", Organisation: org, Name: name, Who: a.who()}); err != nil {
			return err
		}
		return a.changed(ctx, org)
	})
}

func (s *Service) CreateGroup(ctx context.Context, raw, org string, g Group) (string, error) {
	g, ok := g.normalise()
	if !ok {
		return "", identity.ErrInvalid
	}
	var id string
	err := s.with(ctx, raw, func(a access) error {
		if err := a.admin(ctx, org); err != nil {
			return err
		}
		var count, last int
		if err := a.tx.QueryRow(ctx, `SELECT count(*),coalesce(max(position),0) FROM organisation_groups WHERE organisation_id=$1`, org).Scan(&count, &last); err != nil {
			return err
		}
		if count >= maxGroups {
			return errTooMany
		}
		var err error
		if id, err = a.insertGroup(ctx, org, g, last+1); err != nil {
			return err
		}
		return a.changed(ctx, org)
	})
	return id, err
}

func (s *Service) UpdateGroup(ctx context.Context, raw, org, id string, g Group) error {
	g, ok := g.normalise()
	if !ok {
		return identity.ErrInvalid
	}
	return s.with(ctx, raw, func(a access) error {
		if err := a.admin(ctx, org); err != nil {
			return err
		}
		sections, err := json.Marshal(g.Sections)
		if err != nil {
			return err
		}
		tag, err := a.tx.Exec(ctx, `UPDATE organisation_groups SET name=$3,sections=$4,actions=$5,all_projects=$6
 WHERE organisation_id=$1 AND id=$2`, org, id, g.Name, sections, g.Actions, g.AllProjects)
		if err == nil && tag.RowsAffected() == 0 {
			err = errNotFound
		}
		if err != nil {
			return err
		}
		return a.changed(ctx, org)
	})
}

// DeleteGroup removes a group; its members keep their other groups.
func (s *Service) DeleteGroup(ctx context.Context, raw, org, id string) error {
	return s.with(ctx, raw, func(a access) error {
		if err := a.admin(ctx, org); err != nil {
			return err
		}
		tag, err := a.tx.Exec(ctx, `DELETE FROM organisation_groups WHERE organisation_id=$1 AND id=$2`, org, id)
		if err == nil && tag.RowsAffected() == 0 {
			err = errNotFound
		}
		if err != nil {
			return err
		}
		if _, err = a.tx.Exec(ctx, `UPDATE organisation_invitations SET groups=array_remove(groups,$2::uuid) WHERE organisation_id=$1`, org, id); err != nil {
			return err
		}
		return a.changed(ctx, org)
	})
}
