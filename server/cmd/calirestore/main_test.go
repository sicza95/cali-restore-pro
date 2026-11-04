package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBootstrapRejectsInvalidMountedCredentials(t *testing.T) {
	t.Setenv("BOOTSTRAP_CREDENTIAL_FILE", "relative.json")
	if err := bootstrap(context.Background(), nil); err == nil {
		t.Fatal("relative path accepted")
	}
	path := filepath.Join(t.TempDir(), "credential.json")
	t.Setenv("BOOTSTRAP_CREDENTIAL_FILE", path)
	if err := bootstrap(context.Background(), nil); err == nil {
		t.Fatal("missing file accepted")
	}
	for _, body := range []string{`{`, `{"email":"private@example.test","password":"private credential value","unknown":true}`, `{} {}`, strings.Repeat(" ", 4097), `{"email":"private@example.test","password":"short"}`} {
		if err := os.WriteFile(path, []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
		err := bootstrap(context.Background(), nil)
		if err == nil || strings.Contains(err.Error(), "private") {
			t.Fatal("invalid file accepted or credential leaked", err)
		}
	}
}
