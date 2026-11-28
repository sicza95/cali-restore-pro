package projects

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// binManager loads the facts the Bin authorizer rechecks inside every command. It locks the
// project row so ownership, organisation and hosting cannot change during the command.
func (a fileAccess) binManager(ctx context.Context, project string) (binActor, error) {
	var actor binActor
	var host *string
	err := a.tx.QueryRow(ctx, `SELECT
 EXISTS (SELECT 1 FROM project_owners WHERE project_id=p.id AND account_id=$2),
 EXISTS (SELECT 1 FROM organisation_members m WHERE m.organisation_id=p.organisation_id AND m.account_id=$2 AND m.role='admin'),
 p.host_id::text
 FROM hosted_projects p WHERE p.id=$1 FOR SHARE`, project, a.account).Scan(&actor.projectOwner, &actor.orgAdmin, &host)
	if errors.Is(err, pgx.ErrNoRows) {
		return actor, errFileMissing
	}
	if err != nil {
		return actor, err
	}
	if !actor.projectOwner && !actor.orgAdmin {
		return actor, errBinForbidden
	}
	if host == nil {
		return actor, nil
	}
	var quota int64
	if err := a.tx.QueryRow(ctx, `SELECT state='active' AND server_features,quota_mib::bigint*1048576 FROM accounts WHERE id=$1`, *host).
		Scan(&actor.hostingEntitled, &quota); err != nil {
		return actor, err
	}
	hostAccess := a
	hostAccess.account = *host
	used, err := hostAccess.usage(ctx)
	if err != nil {
		return actor, err
	}
	actor.quotaAvailable = used <= quota
	return actor, nil
}

type binCapability struct {
	Allowed bool   `json:"allowed"`
	Reason  string `json:"reason,omitempty"`
}

type binCatalogEntry struct {
	DeletionID      string              `json:"deletionId"`
	ProjectID       string              `json:"projectId"`
	EntityKind      string              `json:"entityKind"`
	EntityID        string              `json:"entityId"`
	ObjectID        *string             `json:"objectId,omitempty"`
	State           binState            `json:"state"`
	Version         int64               `json:"version"`
	DeletedAt       time.Time           `json:"deletedAt"`
	DeletedBy       *string             `json:"deletedBy"`
	RecoverUntil    time.Time           `json:"recoverUntil"`
	ManifestSchema  int                 `json:"manifestSchema"`
	ManifestSHA256  string              `json:"manifestSha256"`
	CoverageMissing []string            `json:"coverageMissing"`
	CoverageLegacy  bool                `json:"coverageLegacy"`
	SourceRevision  int                 `json:"sourceRevision"`
	LogicalBytes    int64               `json:"logicalBytes"`
	ChunkCount      int                 `json:"chunkCount"`
	Display         *revisionCiphertext `json:"display"`
	// Legacy whole-project deletions from before the Bin: surfaced through this adapter only.
	Legacy       bool                     `json:"legacy"`
	Capabilities map[string]binCapability `json:"capabilities"`
}

type binCatalog struct {
	Entries []binCatalogEntry `json:"entries"`
	// Next continues the same ordering; AsOf is the watermark the page was read at.
	Next *string   `json:"next"`
	AsOf time.Time `json:"asOf"`
}

// Legacy whole-project trash kept the hosted head (graph and checkpoints) and its files only.
var legacyMissing = []string{"journals", "estimates", "reports", "issued"}

// binCatalog lists retained entries of one organisation that the account may manage, newest
// deleted first, including legacy hosted-project deletions without a Bin entry.
func (a fileAccess) binCatalog(ctx context.Context, organisation string, before *binCursor, limit int) (binCatalog, error) {
	result := binCatalog{Entries: []binCatalogEntry{}}
	if err := a.tx.QueryRow(ctx, `SELECT clock_timestamp()`).Scan(&result.AsOf); err != nil {
		return result, err
	}
	var at *time.Time
	var after *string
	if before != nil {
		at, after = &before.at, &before.id
	}
	rows, err := a.tx.Query(ctx, `WITH managed AS (
 SELECT p.id FROM hosted_projects p WHERE p.organisation_id=$1 AND (
  EXISTS (SELECT 1 FROM project_owners o WHERE o.project_id=p.id AND o.account_id=$2) OR
  EXISTS (SELECT 1 FROM organisation_members m WHERE m.organisation_id=p.organisation_id AND m.account_id=$2 AND m.role='admin'))
), listed AS (
 SELECT e.deletion_id::text AS deletion_id,e.project_id::text AS project_id,e.entity_kind,e.entity_id::text AS entity_id,e.object_id::text AS object_id,
  e.state,e.version,e.deleted_at,e.deleted_by::text AS deleted_by,e.recover_until,e.manifest_schema,e.manifest_sha256,e.coverage_missing,
  e.coverage_legacy,e.source_revision,e.logical_bytes,e.chunk_count,e.display_salt,e.display_ciphertext,false AS legacy
 FROM bin_entries e JOIN managed m ON m.id=e.project_id WHERE e.state='retained'
 UNION ALL
 SELECT d.id::text,d.id::text,'project',d.id::text,NULL,'retained',1,d.deleted_at,NULL,d.recover_until,0,'',$5::text[],true,0,0,0,NULL,NULL,true
 FROM project_deletions d JOIN managed m ON m.id=d.id
 WHERE d.purged_at IS NULL AND NOT EXISTS (SELECT 1 FROM bin_entries e WHERE e.project_id=d.id AND e.entity_kind='project' AND e.state='retained')
)
SELECT * FROM listed WHERE $3::timestamptz IS NULL OR (deleted_at,deletion_id) < ($3,$4)
ORDER BY deleted_at DESC,deletion_id DESC LIMIT $6`, organisation, a.account, at, after, legacyMissing, limit+1)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	actors := map[string]binActor{}
	for rows.Next() {
		var e binCatalogEntry
		var salt, ciphertext []byte
		if err := rows.Scan(&e.DeletionID, &e.ProjectID, &e.EntityKind, &e.EntityID, &e.ObjectID, &e.State, &e.Version, &e.DeletedAt,
			&e.DeletedBy, &e.RecoverUntil, &e.ManifestSchema, &e.ManifestSHA256, &e.CoverageMissing, &e.CoverageLegacy,
			&e.SourceRevision, &e.LogicalBytes, &e.ChunkCount, &salt, &ciphertext, &e.Legacy); err != nil {
			return result, err
		}
		if salt != nil {
			e.Display = &revisionCiphertext{Salt: salt, Ciphertext: ciphertext}
		}
		result.Entries = append(result.Entries, e)
	}
	if err := rows.Err(); err != nil {
		return result, err
	}
	rows.Close()
	if len(result.Entries) > limit {
		last := result.Entries[limit-1]
		next := encodeBinCursor(binCursor{at: last.DeletedAt, id: last.DeletionID})
		result.Next = &next
		result.Entries = result.Entries[:limit]
	}
	for i := range result.Entries {
		e := &result.Entries[i]
		actor, ok := actors[e.ProjectID]
		if !ok {
			var err error
			if actor, err = a.binManager(ctx, e.ProjectID); err != nil {
				return result, err
			}
			actors[e.ProjectID] = actor
		}
		e.Capabilities = capabilitiesOf(e.facts(), actor, result.AsOf)
	}
	return result, nil
}

func (e binCatalogEntry) facts() binEntryFacts {
	return binEntryFacts{state: e.State, version: e.Version, recoverUntil: e.RecoverUntil,
		coverageGap: len(e.CoverageMissing) > 0, legacyCoverage: e.CoverageLegacy, projectEntry: e.EntityKind == "project"}
}

func capabilitiesOf(facts binEntryFacts, actor binActor, now time.Time) map[string]binCapability {
	result := map[string]binCapability{}
	for _, action := range []binAction{binRead, binRestore, binPurge, binDeviceExport} {
		if err := authorizeBin(facts, actor, action, now); err != nil {
			result[string(action)] = binCapability{Reason: binFailureCode(err)}
		} else {
			result[string(action)] = binCapability{Allowed: true}
		}
	}
	return result
}

// stageBinChunk stores one bounded, hashed chunk before its lifecycle command commits.
// Committed chunks are immutable; restaging the same index replaces only an uncommitted one.
func (a fileAccess) stageBinChunk(ctx context.Context, project, deletion string, index int, digest string, body []byte) error {
	if _, err := a.binManager(ctx, project); err != nil {
		return err
	}
	sum := sha256.Sum256(body)
	if hex.EncodeToString(sum[:]) != digest {
		return errBinIncomplete
	}
	var committed bool
	err := a.tx.QueryRow(ctx, `SELECT committed FROM bin_chunks WHERE deletion_id=$1 AND idx=$2 FOR UPDATE`, deletion, index).Scan(&committed)
	if err == nil && committed {
		return errBinNotRetained
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if err := a.binGrowth(ctx, project, int64(len(body))); err != nil {
		return err
	}
	_, err = a.tx.Exec(ctx, `INSERT INTO bin_chunks(deletion_id,idx,project_id,sha256,body,staged_by) VALUES($1,$2,$3,$4,$5,$6)
 ON CONFLICT (deletion_id,idx) DO UPDATE SET sha256=excluded.sha256,body=excluded.body,staged_by=excluded.staged_by,staged_at=clock_timestamp()
 WHERE NOT bin_chunks.committed`, deletion, index, project, digest, body, a.account)
	return err
}

// binChunk returns one committed chunk of an entry the account may still read.
func (a fileAccess) binChunk(ctx context.Context, deletion string, index int) ([]byte, error) {
	var project string
	if err := a.tx.QueryRow(ctx, `SELECT project_id::text FROM bin_entries WHERE deletion_id=$1`, deletion).Scan(&project); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errFileMissing
		}
		return nil, err
	}
	if _, err := a.binManager(ctx, project); err != nil {
		return nil, err
	}
	var body []byte
	var state binState
	var deadline, now time.Time
	err := a.tx.QueryRow(ctx, `SELECT e.state,e.recover_until,clock_timestamp(),c.body FROM bin_entries e
 LEFT JOIN bin_chunks c ON c.deletion_id=e.deletion_id AND c.idx=$2 AND c.committed
 WHERE e.deletion_id=$1`, deletion, index).Scan(&state, &deadline, &now, &body)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errFileMissing
	}
	if err != nil {
		return nil, err
	}
	if err := binPayloadAvailable(state, deadline, now); err != nil {
		return nil, err
	}
	if body == nil {
		return nil, errFileMissing
	}
	return body, nil
}

func binPayloadAvailable(state binState, deadline, now time.Time) error {
	if state != binRetained {
		return errBinNotRetained
	}
	if !now.Before(deadline) {
		return errBinExpired
	}
	return nil
}

// binGrowth charges newly uploaded recovery data to the project's host, like other hosted bytes.
func (a fileAccess) binGrowth(ctx context.Context, project string, bytes int64) error {
	var host *string
	if err := a.tx.QueryRow(ctx, `SELECT host_id::text FROM hosted_projects WHERE id=$1`, project).Scan(&host); err != nil {
		return err
	}
	if host == nil {
		return errBinHostingUnavailable
	}
	var enabled bool
	var quota int64
	if err := a.tx.QueryRow(ctx, `SELECT state='active' AND server_features,quota_mib::bigint*1048576 FROM accounts WHERE id=$1`, *host).
		Scan(&enabled, &quota); err != nil {
		return err
	}
	if !enabled {
		return errBinHostingUnavailable
	}
	hostAccess := a
	hostAccess.account = *host
	used, err := hostAccess.usage(ctx)
	if err == nil && used+bytes > quota {
		return errBinQuotaExceeded
	}
	return err
}
