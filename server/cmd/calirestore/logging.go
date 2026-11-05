package main

import (
	"errors"
	"log/slog"

	"github.com/sicza95/cali-restore-pro/server/internal/config"
)

func logCommandFailure(logger *slog.Logger, err error) {
	switch {
	case errors.Is(err, config.ErrInsecureProductionOrigin):
		logger.Error("production APP_ORIGIN requires HTTPS")
	case errors.Is(err, config.ErrUnreadablePasswordFile):
		logger.Error("cannot read DB_PASSWORD_FILE")
	default:
		logger.Error("command failed")
	}
}

// net/http diagnostics can include peer addresses, request fragments and panic
// values. Keep the event visible without writing these fields to stdout.
type httpDiagnostic struct {
	logger *slog.Logger
}

func (d httpDiagnostic) Write(p []byte) (int, error) {
	d.logger.Error("HTTP diagnostic")
	return len(p), nil
}
