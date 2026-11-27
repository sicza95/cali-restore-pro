package projects

import (
	"errors"
	"testing"
	"time"
)

func TestBinAuthorization(t *testing.T) {
	now := time.Date(2026, 11, 27, 12, 0, 0, 0, time.UTC)
	retained := binEntryFacts{state: binRetained, version: 1, recoverUntil: now.Add(binRecovery), projectEntry: true}
	owner := binActor{projectOwner: true, hostingEntitled: true, quotaAvailable: true}
	cases := []struct {
		name   string
		entry  binEntryFacts
		actor  binActor
		action binAction
		want   error
	}{
		{"owner restores", retained, owner, binRestore, nil},
		{"org admin restores", retained, binActor{orgAdmin: true, hostingEntitled: true, quotaAvailable: true}, binRestore, nil},
		{"member cannot read", retained, binActor{hostingEntitled: true, quotaAvailable: true}, binRead, errBinForbidden},
		{"no hosting blocks restore", retained, binActor{projectOwner: true, quotaAvailable: true}, binRestore, errBinHostingUnavailable},
		{"zero quota blocks restore", retained, binActor{projectOwner: true, hostingEntitled: true}, binRestore, errBinQuotaExceeded},
		{"zero quota still purges", retained, binActor{projectOwner: true}, binPurge, nil},
		{"no hosting still reads", retained, binActor{projectOwner: true}, binRead, nil},
		{"deadline is exclusive", binEntryFacts{state: binRetained, recoverUntil: now}, owner, binRestore, errBinExpired},
		{"expired still purges", binEntryFacts{state: binRetained, recoverUntil: now}, owner, binPurge, nil},
		{"incomplete blocks restore", binEntryFacts{state: binRetained, recoverUntil: now.Add(time.Hour), coverageGap: true}, owner, binRestore, errBinIncomplete},
		{"legacy restores declared coverage", binEntryFacts{state: binRetained, recoverUntil: now.Add(time.Hour), coverageGap: true, legacyCoverage: true}, owner, binRestore, nil},
		{"terminal entries are read only", binEntryFacts{state: binPurged}, owner, binPurge, errBinNotRetained},
		{"device copy needs a project", binEntryFacts{state: binRetained, recoverUntil: now.Add(time.Hour)}, owner, binDeviceExport, errBinForbidden},
		{"device copy of a project", retained, owner, binDeviceExport, nil},
	}
	for _, c := range cases {
		if err := authorizeBin(c.entry, c.actor, c.action, now); !errors.Is(err, c.want) {
			t.Errorf("%s: got %v, want %v", c.name, err, c.want)
		}
	}
}

func TestBinTransitionsAndIdempotency(t *testing.T) {
	now := time.Date(2026, 11, 27, 12, 0, 0, 0, time.UTC)
	entry := binEntryFacts{state: binRetained, version: 3, recoverUntil: now.Add(time.Hour)}
	if _, err := transitionBin(entry, binRestore, 2, now); !errors.Is(err, errBinStale) {
		t.Fatalf("stale version: %v", err)
	}
	restored, err := transitionBin(entry, binRestore, 3, now)
	if err != nil || restored.state != binRestored || restored.version != 4 {
		t.Fatalf("restore: %+v %v", restored, err)
	}
	if _, err := transitionBin(restored, binPurge, 4, now); !errors.Is(err, errBinNotRetained) {
		t.Fatalf("terminal: %v", err)
	}
	if _, err := transitionBin(entry, binRestore, 3, now.Add(time.Hour)); !errors.Is(err, errBinExpired) {
		t.Fatalf("expired: %v", err)
	}
	if purged, err := transitionBin(entry, binPurge, 3, now.Add(2*time.Hour)); err != nil || purged.state != binPurged {
		t.Fatalf("purge after deadline: %+v %v", purged, err)
	}
	if code := binFailureCode(errBinQuotaExceeded); code != "quota_exceeded" {
		t.Fatalf("code: %q", code)
	}
	if binFailureCode(errors.New("other")) != "" {
		t.Fatal("untyped errors have no Bin code")
	}
	if err := checkWriterProtocol(binWriterProtocol - 1); !errors.Is(err, errBinProtocolOutdated) {
		t.Fatalf("protocol: %v", err)
	}
	if replay, err := binReplay("", "a"); replay || err != nil {
		t.Fatal("unseen operation executes")
	}
	if replay, err := binReplay("a", "a"); !replay || err != nil {
		t.Fatal("identical retry replays")
	}
	if _, err := binReplay("a", "b"); !errors.Is(err, errBinDigestMismatch) {
		t.Fatal("altered reuse fails")
	}
}
