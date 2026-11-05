package main

import (
	"bytes"
	"encoding/json"
	"log"
	"log/slog"
	"testing"
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
