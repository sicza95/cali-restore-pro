package projects

import (
	"errors"
	"time"
)

// Bin lifecycle contract. Wire values match the Bin* schemas in contracts/openapi.json and the
// client planner in src/platform/projects/bin.
//
// Lock order for every lifecycle command: lifecycle advisory lock (lifecycleWriteLock), account,
// project head (revision/epoch compare-and-set), Bin entries by ascending deletion ID, asset pins
// by ascending asset ID, operation receipts. Head, entry transition, pins, terminal fence and
// receipt commit in one transaction; none of them is written on its own.

// binWriterProtocol is the oldest client protocol allowed to write once Bin manifests are enabled.
const binWriterProtocol = 2

const binRecovery = 720 * time.Hour

type binState string

const (
	binRetained binState = "retained"
	binRestored binState = "restored"
	binPurged   binState = "purged"
)

type binAction string

const (
	binRead         binAction = "read"
	binRestore      binAction = "restore"
	binPurge        binAction = "purge"
	binDeviceExport binAction = "device_export"
)

// binError carries the typed failure code returned to clients.
type binError struct{ code string }

func (e *binError) Error() string { return "bin: " + e.code }

var (
	errBinForbidden          = &binError{"forbidden"}
	errBinHostingUnavailable = &binError{"hosting_unavailable"}
	errBinQuotaExceeded      = &binError{"quota_exceeded"}
	errBinExpired            = &binError{"expired"}
	errBinNotRetained        = &binError{"not_retained"}
	errBinIncomplete         = &binError{"incomplete_recovery"}
	errBinStale              = &binError{"stale_revision"}
	errBinDigestMismatch     = &binError{"digest_mismatch"}
	errBinProtocolOutdated   = &binError{"protocol_outdated"}
)

// binFailureCode returns the wire code for a Bin failure, or "" for any other error.
func binFailureCode(err error) string {
	var typed *binError
	if errors.As(err, &typed) {
		return typed.code
	}
	return ""
}

// binActor holds facts rechecked inside the command transaction. Listed visibility, ordinary
// membership, editing access and report links are deliberately absent: they grant nothing.
type binActor struct {
	projectOwner    bool
	orgAdmin        bool
	hostingEntitled bool
	quotaAvailable  bool
}

type binEntryFacts struct {
	state          binState
	version        int64
	recoverUntil   time.Time
	coverageGap    bool
	legacyCoverage bool
	projectEntry   bool
}

// authorizeBin is the purpose-scoped Bin authorizer. It does not replace requireProjectOwner,
// which keeps rejecting deleted projects for ordinary access.
func authorizeBin(entry binEntryFacts, actor binActor, action binAction, now time.Time) error {
	if !actor.projectOwner && !actor.orgAdmin {
		return errBinForbidden
	}
	if action == binRead {
		return nil
	}
	if entry.state != binRetained {
		return errBinNotRetained
	}
	switch action {
	case binPurge:
		// No hosting entitlement or zero quota never blocks permanent deletion.
		return nil
	case binRestore:
		if !now.Before(entry.recoverUntil) {
			return errBinExpired
		}
		if entry.coverageGap && !entry.legacyCoverage {
			return errBinIncomplete
		}
		if !actor.hostingEntitled {
			return errBinHostingUnavailable
		}
		if !actor.quotaAvailable {
			return errBinQuotaExceeded
		}
		return nil
	case binDeviceExport:
		if !entry.projectEntry {
			return errBinForbidden
		}
		if entry.coverageGap {
			return errBinIncomplete
		}
		return nil
	}
	return errBinForbidden
}

// transitionBin applies one legal transition. Restored and purged are terminal for a deletion
// event; deleting the entity again creates a new event with a new deadline.
func transitionBin(entry binEntryFacts, action binAction, expectedVersion int64, now time.Time) (binEntryFacts, error) {
	if entry.version != expectedVersion {
		return entry, errBinStale
	}
	if entry.state != binRetained {
		return entry, errBinNotRetained
	}
	next := entry
	next.version++
	switch action {
	case binRestore:
		if !now.Before(entry.recoverUntil) {
			return entry, errBinExpired
		}
		next.state = binRestored
	case binPurge:
		next.state = binPurged
	default:
		return entry, errBinForbidden
	}
	return next, nil
}

// checkWriterProtocol rejects writers that do not understand lifecycle manifests or fences.
func checkWriterProtocol(version int) error {
	if version < binWriterProtocol {
		return errBinProtocolOutdated
	}
	return nil
}

// binReplay implements operation idempotency: an identical retry returns the stored outcome;
// reusing an operation ID for a different request fails.
func binReplay(storedDigest, digest string) (replay bool, err error) {
	if storedDigest == "" {
		return false, nil
	}
	if storedDigest != digest {
		return false, errBinDigestMismatch
	}
	return true, nil
}
