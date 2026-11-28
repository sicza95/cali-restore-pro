package projects

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
)

// binTrash describes the entry a trash command creates. Sealed fields stay opaque to the server.
type binTrash struct {
	DeletionID      string             `json:"deletionId"`
	EntityKind      string             `json:"entityKind"`
	EntityID        string             `json:"entityId"`
	ObjectID        *string            `json:"objectId"`
	ManifestSchema  int                `json:"manifestSchema"`
	ManifestSHA256  string             `json:"manifestSha256"`
	CoverageMissing []string           `json:"coverageMissing"`
	SourceRevision  int                `json:"sourceRevision"`
	LogicalBytes    int64              `json:"logicalBytes"`
	ChunkCount      int                `json:"chunkCount"`
	Assets          []string           `json:"assets"`
	Display         revisionCiphertext `json:"display"`
	Manifest        revisionCiphertext `json:"manifest"`
}

type binCommand struct {
	OperationID      string           `json:"operationId"`
	Digest           string           `json:"digest"`
	WriterProtocol   int              `json:"writerProtocol"`
	Intent           string           `json:"intent"`
	DeletionIDs      []string         `json:"deletionIds"`
	ExpectedVersions map[string]int64 `json:"expectedVersions"`
	// Head is the child graph change committed with the lifecycle transition.
	Head  *revisionWrite `json:"head"`
	Trash *binTrash      `json:"trash"`
}

type binOutcome struct {
	Versions map[string]int64 `json:"versions"`
	// Cascaded lists retained entries purged with their project.
	Cascaded     []string             `json:"cascaded"`
	RecoverUntil map[string]time.Time `json:"recoverUntil"`
	Head         *revisionHead        `json:"head"`
}

// binExecute runs one lifecycle command in the caller's transaction, which holds the lifecycle
// write lock. Head, entries, chunks, pins, fences and the receipt commit together.
func (a fileAccess) binExecute(ctx context.Context, project string, cmd binCommand) (binOutcome, error) {
	outcome := binOutcome{Versions: map[string]int64{}, Cascaded: []string{}, RecoverUntil: map[string]time.Time{}}
	if err := checkWriterProtocol(cmd.WriterProtocol); err != nil {
		return outcome, err
	}
	actor, err := a.binManager(ctx, project)
	if err != nil {
		return outcome, err
	}
	var stored string
	var saved []byte
	err = a.tx.QueryRow(ctx, `SELECT digest,outcome FROM bin_receipts WHERE operation_id=$1 AND project_id=$2`, cmd.OperationID, project).Scan(&stored, &saved)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return outcome, err
	}
	if replay, err := binReplay(stored, cmd.Digest); err != nil || replay {
		if err == nil {
			err = json.Unmarshal(saved, &outcome)
		}
		return outcome, err
	}
	now, err := a.now(ctx)
	if err != nil {
		return outcome, err
	}
	switch cmd.Intent {
	case "trash":
		err = a.binTrash(ctx, project, cmd, &outcome, now)
	case "restore", "purge":
		err = a.binFinish(ctx, project, cmd, actor, &outcome, now)
	default:
		err = errBinForbidden
	}
	if err != nil {
		return outcome, err
	}
	encoded, err := json.Marshal(outcome)
	if err != nil {
		return outcome, err
	}
	_, err = a.tx.Exec(ctx, `INSERT INTO bin_receipts(operation_id,project_id,digest,outcome) VALUES($1,$2,$3,$4)`,
		cmd.OperationID, project, cmd.Digest, encoded)
	return outcome, err
}

func (a fileAccess) now(ctx context.Context) (now time.Time, err error) {
	err = a.tx.QueryRow(ctx, `SELECT clock_timestamp()`).Scan(&now)
	return
}

func (a fileAccess) binTrash(ctx context.Context, project string, cmd binCommand, outcome *binOutcome, now time.Time) error {
	t := cmd.Trash
	if t == nil || t.ChunkCount < 1 || (t.EntityKind == "project") == (cmd.Head != nil) {
		return errBinIncomplete
	}
	// New hosted deletions must be completely recoverable; nothing incomplete is accepted.
	if len(t.CoverageMissing) > 0 {
		return errBinIncomplete
	}
	var missingAsset bool
	if err := a.tx.QueryRow(ctx, `SELECT EXISTS (
 SELECT 1 FROM unnest($2::uuid[]) AS asset(id) WHERE NOT EXISTS (
  SELECT 1 FROM encrypted_files f WHERE f.id=asset.id AND f.project_id=$1 AND f.state='committed'
 ))`, project, t.Assets).Scan(&missingAsset); err != nil {
		return err
	}
	if missingAsset {
		return errBinIncomplete
	}
	var staged int
	if err := a.tx.QueryRow(ctx, `SELECT count(*) FROM bin_chunks WHERE deletion_id=$1 AND project_id=$2 AND NOT committed AND idx<$3`,
		t.DeletionID, project, t.ChunkCount).Scan(&staged); err != nil {
		return err
	}
	if staged != t.ChunkCount {
		return errBinIncomplete
	}
	recoverUntil := now.Add(binRecovery)
	if t.EntityKind == "project" {
		// The existing whole-project gate; forced account deletion keeps its shorter deadline.
		err := a.tx.QueryRow(ctx, `INSERT INTO project_deletions(id,deleted_at,recover_until) VALUES($1,$2,$3)
 ON CONFLICT(id) DO NOTHING RETURNING recover_until`, project, now, recoverUntil).Scan(&recoverUntil)
		if errors.Is(err, pgx.ErrNoRows) {
			return errBinNotRetained
		}
		if err != nil {
			return err
		}
	} else {
		if err := a.requireLiveProject(ctx, project); err != nil {
			return err
		}
		state, err := a.revisionHead(ctx, project, cmd.Head)
		if errors.Is(err, errRevisionConflict) || errors.Is(err, errRevisionEpoch) {
			return errBinStale
		}
		if err != nil {
			return err
		}
		outcome.Head = state.Head
	}
	_, err := a.tx.Exec(ctx, `INSERT INTO bin_entries(deletion_id,project_id,entity_kind,entity_id,object_id,deleted_at,deleted_by,recover_until,
 manifest_schema,manifest_sha256,coverage_missing,source_revision,operation_id,logical_bytes,chunk_count,display_salt,display_ciphertext,manifest_salt,manifest_ciphertext)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
		t.DeletionID, project, t.EntityKind, t.EntityID, t.ObjectID, now, a.account, recoverUntil, t.ManifestSchema, t.ManifestSHA256,
		[]string{}, t.SourceRevision, cmd.OperationID, t.LogicalBytes, t.ChunkCount, t.Display.Salt, t.Display.Ciphertext, t.Manifest.Salt, t.Manifest.Ciphertext)
	if err != nil {
		return err
	}
	if _, err := a.tx.Exec(ctx, `UPDATE bin_chunks SET committed=true WHERE deletion_id=$1 AND idx<$2`, t.DeletionID, t.ChunkCount); err != nil {
		return err
	}
	if _, err := a.tx.Exec(ctx, `DELETE FROM bin_chunks WHERE deletion_id=$1 AND NOT committed`, t.DeletionID); err != nil {
		return err
	}
	if _, err := a.tx.Exec(ctx, `INSERT INTO bin_pins(asset_id,deletion_id) SELECT unnest($1::uuid[]),$2 ON CONFLICT DO NOTHING`, t.Assets, t.DeletionID); err != nil {
		return err
	}
	outcome.Versions[t.DeletionID] = 1
	outcome.RecoverUntil[t.DeletionID] = recoverUntil
	return nil
}

type binRow struct {
	id, kind, entity string
	facts            binEntryFacts
}

// binFinish restores or purges entries of one project at their expected versions.
func (a fileAccess) binFinish(ctx context.Context, project string, cmd binCommand, actor binActor, outcome *binOutcome, now time.Time) error {
	ids := slices.Clone(cmd.DeletionIDs)
	slices.Sort(ids)
	if len(ids) == 0 || len(ids) > 100 {
		return errBinIncomplete
	}
	action := binRestore
	if cmd.Intent == "purge" {
		action = binPurge
	}
	if cmd.ExpectedVersions == nil {
		cmd.ExpectedVersions = map[string]int64{}
	}
	rows, err := a.lockBinEntries(ctx, project, ids)
	if err != nil {
		return err
	}
	whole := false
	for _, row := range rows {
		if err := authorizeBin(row.facts, actor, action, now); err != nil {
			return err
		}
		whole = whole || row.kind == "project"
	}
	if action == binPurge && whole {
		// A project purge ends every other retained entry of that project as well.
		extra, err := a.tx.Query(ctx, `SELECT deletion_id::text FROM bin_entries WHERE project_id=$1 AND state='retained' AND NOT deletion_id=ANY($2::uuid[]) ORDER BY deletion_id`, project, ids)
		if err != nil {
			return err
		}
		cascaded, err := pgx.CollectRows(extra, pgx.RowTo[string])
		if err != nil {
			return err
		}
		more, err := a.lockBinEntries(ctx, project, cascaded)
		if err != nil {
			return err
		}
		for _, row := range more {
			cmd.ExpectedVersions[row.id] = row.facts.version
		}
		rows = append(rows, more...)
		outcome.Cascaded = cascaded
	}
	for _, row := range rows {
		next, err := transitionBin(row.facts, action, cmd.ExpectedVersions[row.id], now)
		if err != nil {
			return err
		}
		reason := any(nil)
		if next.state == binPurged {
			reason = "requested"
			if slices.Contains(outcome.Cascaded, row.id) {
				reason = "project_purged"
			}
		}
		if _, err := a.tx.Exec(ctx, `UPDATE bin_entries SET state=$2,version=$3,purge_reason=$4 WHERE deletion_id=$1`, row.id, next.state, next.version, reason); err != nil {
			return err
		}
		if _, err := a.tx.Exec(ctx, `INSERT INTO bin_fences(project_id,entity_id,deletion_id,state,version,digest) VALUES($1,$2,$3,$4,$5,$6)`,
			project, row.entity, row.id, next.state, next.version, cmd.Digest); err != nil {
			return err
		}
		if _, err := a.tx.Exec(ctx, `DELETE FROM bin_chunks WHERE deletion_id=$1`, row.id); err != nil {
			return err
		}
		if _, err := a.tx.Exec(ctx, `DELETE FROM bin_pins WHERE deletion_id=$1`, row.id); err != nil {
			return err
		}
		outcome.Versions[row.id] = next.version
	}
	switch {
	case whole && action == binRestore:
		tag, err := a.tx.Exec(ctx, `DELETE FROM project_deletions WHERE id=$1 AND recover_until>clock_timestamp() AND purged_at IS NULL AND forced_account_id IS NULL`, project)
		if err == nil && tag.RowsAffected() == 0 {
			err = errBinExpired
		}
		if err != nil {
			return err
		}
	case whole:
		// The existing deletion worker physically removes the project after this deadline.
		if _, err := a.tx.Exec(ctx, `UPDATE project_deletions SET recover_until=least(recover_until,clock_timestamp()) WHERE id=$1`, project); err != nil {
			return err
		}
	}
	if cmd.Head != nil {
		if err := a.requireLiveProject(ctx, project); err != nil {
			return err
		}
		state, err := a.revisionHead(ctx, project, cmd.Head)
		if errors.Is(err, errRevisionConflict) || errors.Is(err, errRevisionEpoch) {
			return errBinStale
		}
		if err != nil {
			return err
		}
		outcome.Head = state.Head
	} else if action == binRestore && !whole {
		return errBinIncomplete
	}
	return nil
}

// lockBinEntries locks entries in ascending deletion ID order (the documented lock order).
func (a fileAccess) lockBinEntries(ctx context.Context, project string, ids []string) ([]binRow, error) {
	result := make([]binRow, 0, len(ids))
	for _, id := range ids {
		var row binRow
		row.id = id
		err := a.tx.QueryRow(ctx, `SELECT entity_kind,entity_id::text,state,version,recover_until,cardinality(coverage_missing)>0,coverage_legacy
 FROM bin_entries WHERE deletion_id=$1 AND project_id=$2 FOR UPDATE`, id, project).
			Scan(&row.kind, &row.entity, &row.facts.state, &row.facts.version, &row.facts.recoverUntil, &row.facts.coverageGap, &row.facts.legacyCoverage)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errBinNotRetained
		}
		if err != nil {
			return nil, err
		}
		row.facts.projectEntry = row.kind == "project"
		result = append(result, row)
	}
	return result, nil
}

// requireLiveProject rejects child graph changes while the whole project is in the Bin.
func (a fileAccess) requireLiveProject(ctx context.Context, project string) error {
	var deleted bool
	if err := a.tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_deletions WHERE id=$1)`, project).Scan(&deleted); err != nil {
		return err
	}
	if deleted {
		return errBinNotRetained
	}
	return nil
}
