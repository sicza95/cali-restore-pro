package main

import "log/slog"

// net/http diagnostics can include peer addresses, request fragments and panic
// values. Keep the event visible without writing these fields to stdout.
type httpDiagnostic struct {
	logger *slog.Logger
}

func (d httpDiagnostic) Write(p []byte) (int, error) {
	d.logger.Error("HTTP diagnostic")
	return len(p), nil
}
