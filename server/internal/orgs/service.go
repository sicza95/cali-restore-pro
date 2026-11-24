// Package orgs holds organisations (plan §8.5): their members and roles,
// their groups (permission sets, plan §8.4) and invitations by email. Every
// account has a personal organisation of one; projects belong to one
// organisation. Requests run as a signed-in account from internal/identity.
package orgs

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sicza95/cali-restore-pro/server/internal/identity"
	"github.com/sicza95/cali-restore-pro/server/internal/live"
)

var (
	errNotFound   = errors.New("organisation not found")
	errLastAdmin  = errors.New("an organisation needs an admin")
	errPersonal   = errors.New("not possible in a personal organisation")
	errHasProject = errors.New("organisation still has projects")
	errMember     = errors.New("already a member")
	errTooMany    = errors.New("limit reached")
)

type Service struct {
	pool     *pgxpool.Pool
	accounts *identity.Service
}

func New(pool *pgxpool.Pool, accounts *identity.Service) *Service {
	return &Service{pool: pool, accounts: accounts}
}

// access is one request's transaction and the signed-in account.
type access struct {
	tx      pgx.Tx
	account string
	email   string
	name    string
}

func (s *Service) with(ctx context.Context, raw string, fn func(access) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	session, err := identity.LookupSession(ctx, tx, raw)
	if err != nil {
		return err
	}
	if err := fn(access{tx: tx, account: session.Account.ID, email: session.Account.Email, name: session.Account.Name}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// role returns the account's role in the organisation and whether it is
// personal. Someone outside the organisation gets errNotFound, so ids of
// other organisations reveal nothing. lock serialises member changes.
func (a access) role(ctx context.Context, org string, lock bool) (string, bool, error) {
	query := `SELECT m.role,o.personal FROM organisation_members m JOIN organisations o ON o.id=m.organisation_id
 WHERE m.organisation_id=$1 AND m.account_id=$2`
	if lock {
		query += ` FOR UPDATE OF o`
	}
	var role string
	var personal bool
	err := a.tx.QueryRow(ctx, query, org, a.account).Scan(&role, &personal)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, errNotFound
	}
	return role, personal, err
}

// admin requires the account to be an admin of a shared organisation.
func (a access) admin(ctx context.Context, org string) error {
	role, personal, err := a.role(ctx, org, true)
	if err != nil {
		return err
	}
	if personal {
		return errPersonal
	}
	if role != "admin" {
		return identity.ErrForbidden
	}
	return nil
}

// keepsAdmin fails when the organisation would have no admin left.
func (a access) keepsAdmin(ctx context.Context, org string) error {
	var admins int
	if err := a.tx.QueryRow(ctx, `SELECT count(*) FROM organisation_members WHERE organisation_id=$1 AND role='admin'`, org).Scan(&admins); err != nil {
		return err
	}
	if admins == 0 {
		return errLastAdmin
	}
	return nil
}

// who names the account in a notice: its full name, or its email.
func (a access) who() string {
	if a.name != "" {
		return a.name
	}
	return a.email
}

// tell queues a notice for every member of org (see live.NotifyOrganisation),
// naming the organisation and the account that acted.
func (a access) tell(ctx context.Context, org, adminKind, memberKind string) error {
	var name string
	if err := a.tx.QueryRow(ctx, `SELECT name FROM organisations WHERE id=$1`, org).Scan(&name); err != nil {
		return err
	}
	return live.NotifyOrganisation(ctx, a.tx, org, a.account, adminKind, memberKind, live.Event{Name: name, Who: a.who()})
}

// changed refreshes every member's pages, with no message.
func (a access) changed(ctx context.Context, org string) error {
	return a.tell(ctx, org, "changed", "changed")
}

// RequireMember reports whether account belongs to org. Projects use it when a
// project is hosted in an organisation.
func RequireMember(ctx context.Context, tx pgx.Tx, org, account string) error {
	var found int
	err := tx.QueryRow(ctx, `SELECT 1 FROM organisation_members WHERE organisation_id=$1 AND account_id=$2`, org, account).Scan(&found)
	if errors.Is(err, pgx.ErrNoRows) {
		return identity.ErrForbidden
	}
	return err
}
