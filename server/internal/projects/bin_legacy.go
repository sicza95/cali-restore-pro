package projects

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// legacyVersion numbers legacy deletions of one project: each restore or purge leaves a fence
// under the project ID, so a later deletion of the same project gets a higher version and a
// command for an earlier one is stale.
const legacyVersion = `coalesce((SELECT f.version FROM bin_fences f WHERE f.project_id=d.id AND f.entity_id=d.id AND f.deletion_id=d.id),0)+1`

// lockLegacyProject locks a whole-project deletion from before the Bin, which the catalog lists
// with the project ID as its deletion ID. It has no bin_entries row: the hosted head and files
// stayed in place, so restore only lifts the deletion gate and purge only moves the deadline
// the deletion worker acts on.
func (a fileAccess) lockLegacyProject(ctx context.Context, project string) ([]binRow, error) {
	row := binRow{id: project, kind: "project", entity: project, legacy: true}
	row.facts = binEntryFacts{state: binRetained, coverageGap: true, legacyCoverage: true, projectEntry: true}
	err := a.tx.QueryRow(ctx, `SELECT d.recover_until,`+legacyVersion+` FROM project_deletions d WHERE d.id=$1 AND d.purged_at IS NULL
 AND NOT EXISTS (SELECT 1 FROM bin_entries e WHERE e.project_id=d.id AND e.entity_kind='project' AND e.state='retained')
 FOR UPDATE OF d`, project).Scan(&row.facts.recoverUntil, &row.facts.version)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errBinNotRetained
	}
	if err != nil {
		return nil, err
	}
	return []binRow{row}, nil
}

// lockFinishRows locks the entries a restore or purge names; a lone project ID addresses its
// legacy deletion.
func (a fileAccess) lockFinishRows(ctx context.Context, project string, ids []string) ([]binRow, error) {
	rows, err := a.lockBinEntries(ctx, project, ids)
	if errors.Is(err, errBinNotRetained) && len(ids) == 1 && ids[0] == project {
		return a.lockLegacyProject(ctx, project)
	}
	return rows, err
}
