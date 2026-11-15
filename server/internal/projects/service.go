// Package projects holds hosted projects: encrypted files, revisions and
// revision keys, checkpoints, hosting transfer, co-owners, sharing, account and
// project deletion, the purge worker and restore verification. Every request
// runs as a signed-in account from internal/identity.
package projects

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sicza95/cali-restore-pro/server/internal/identity"
)

type Service struct {
	pool     *pgxpool.Pool
	accounts *identity.Service
}

func New(pool *pgxpool.Pool, accounts *identity.Service) *Service {
	return &Service{pool: pool, accounts: accounts}
}
