package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"log/slog"
	"testing"

	"github.com/sicza95/cali-restore-pro/server/internal/config"
)

func TestHTTPDiagnosticAllowlist(t *testing.T) {
	var output bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&output, nil))
	log.New(httpDiagnostic{logger}, "", 0).Print("private peer, path, and panic details")
	var event map[string]any
	if err := json.Unmarshal(output.Bytes(), &event); err != nil {
		t.Fatal(err)
	}
	if len(event) != 3 || event["time"] == nil || event["level"] != "ERROR" || event["msg"] != "HTTP diagnostic" {
		t.Fatalf("unexpected diagnostic: %v", event)
	}
}

func TestCommandFailureAllowlist(t *testing.T) {
	for _, tc := range []struct {
		err  error
		want string
	}{
		{fmt.Errorf("private origin details: %w", config.ErrInsecureProductionOrigin), "production APP_ORIGIN requires HTTPS"},
		{fmt.Errorf("private file path: %w", config.ErrUnreadablePasswordFile), "cannot read DB_PASSWORD_FILE"},
		{errors.New("production APP_ORIGIN requires HTTPS with private details"), "command failed"},
	} {
		var output bytes.Buffer
		logger := slog.New(slog.NewJSONHandler(&output, nil))
		logCommandFailure(logger, tc.err)
		var event map[string]any
		if err := json.Unmarshal(output.Bytes(), &event); err != nil {
			t.Fatal(err)
		}
		if len(event) != 3 || event["time"] == nil || event["level"] != "ERROR" || event["msg"] != tc.want {
			t.Fatalf("unexpected diagnostic: %v", event)
		}
	}
}
