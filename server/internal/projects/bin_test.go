package projects

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"sync"
	"testing"

	"github.com/sicza95/cali-restore-pro/server/internal/identity"
	"github.com/sicza95/cali-restore-pro/server/internal/identity/passhash"
	"github.com/sicza95/cali-restore-pro/server/internal/identity/sessiontoken"
	"github.com/sicza95/cali-restore-pro/server/internal/testdb"
)

func TestPostgresBinLifecycle(t *testing.T) {
	admin, app := testdb.New(t)
	ctx := context.Background()
	ids, err := identity.New(app)
	if err != nil {
		t.Fatal(err)
	}
	s := New(app, ids)
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := admin.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	hash, err := passhash.Hash(testdb.Password)
	if err != nil {
		t.Fatal(err)
	}
	account := func(email string) (id, raw string) {
		t.Helper()
		if err := admin.QueryRow(ctx, `INSERT INTO accounts(email,password_hash,state,server_features,quota_mib)
 VALUES($1,$2,'active',true,10) RETURNING id`, email, hash).Scan(&id); err != nil {
			t.Fatal(err)
		}
		raw = sessiontoken.New()
		exec("INSERT INTO sessions(account_id,token_digest) VALUES($1,$2)", id, sessiontoken.Digest(raw))
		return
	}
	host, hostSession := account("bin-host@example.test")
	orgAdmin, adminSession := account("bin-admin@example.test")
	member, memberSession := account("bin-member@example.test")
	_, strangerSession := account("bin-stranger@example.test")
	var org string
	if err := admin.QueryRow(ctx, `INSERT INTO organisations(name) VALUES('Studio') RETURNING id`).Scan(&org); err != nil {
		t.Fatal(err)
	}
	exec(`INSERT INTO organisation_members(organisation_id,account_id,role) VALUES($1,$2,'admin'),($1,$3,'admin'),($1,$4,'member')`, org, host, orgAdmin, member)
	project := "c0ffee00-0000-4000-8000-0000000000b1"
	legacy := "c0ffee00-0000-4000-8000-0000000000b2"
	for _, id := range []string{project, legacy} {
		exec(`WITH created AS (INSERT INTO hosted_projects(id,host_id,organisation_id) VALUES($1,$2,$3) RETURNING id,host_id)
 INSERT INTO project_owners SELECT id,host_id FROM created`, id, host, org)
	}
	exec(`INSERT INTO project_deletions(id,deleted_at,recover_until) VALUES($1,clock_timestamp(),clock_timestamp()+interval '720 hours')`, legacy)
	var epoch string
	if err := admin.QueryRow(ctx, `SELECT sync_epoch::text FROM hosted_projects WHERE id=$1`, project).Scan(&epoch); err != nil {
		t.Fatal(err)
	}

	random := func(n int) []byte {
		b := make([]byte, n)
		_, _ = rand.Read(b)
		return b
	}
	sealed := func() revisionCiphertext { return revisionCiphertext{Salt: random(32), Ciphertext: random(48)} }
	head := func(expected int) *revisionWrite {
		return &revisionWrite{revisionCiphertext: sealed(), Expected: &expected, Epoch: epoch}
	}
	digest := func(b []byte) string { sum := sha256.Sum256(b); return hex.EncodeToString(sum[:]) }
	uuid := func(n int) string {
		return "b1000000-0000-4000-8000-" + hex.EncodeToString([]byte{0, 0, 0, 0, 0, byte(n)})
	}
	exec(`INSERT INTO encrypted_files(id,project_id,source_bytes,manifest_bytes,state) VALUES($1,$2,256,32,'committed')`, uuid(80), project)
	stage := func(raw, deletion string) error {
		body := random(256)
		return s.withFiles(ctx, raw, func(a fileAccess) error {
			return a.stageBinChunk(ctx, project, deletion, 0, digest(body), body)
		})
	}
	run := func(raw string, cmd binCommand) (out binOutcome, err error) {
		err = s.withFileLock(ctx, raw, lifecycleWriteLock, func(a fileAccess) error {
			out, err = a.binExecute(ctx, project, cmd)
			return err
		})
		return
	}
	trash := func(op, deletion, kind string, h *revisionWrite, objectID *string) binCommand {
		return binCommand{OperationID: op, Digest: digest([]byte(op)), WriterProtocol: binWriterProtocol, Intent: "trash", Head: h,
			Trash: &binTrash{DeletionID: deletion, EntityKind: kind, EntityID: uuid(90), ObjectID: objectID, ManifestSchema: 1,
				ManifestSHA256: digest([]byte(deletion)), SourceRevision: 0, LogicalBytes: 256, ChunkCount: 1,
				Assets: []string{uuid(80)}, Display: sealed(), Manifest: sealed()}}
	}
	finish := func(op, intent string, h *revisionWrite, versions map[string]int64) binCommand {
		var deletions []string
		for id := range versions {
			deletions = append(deletions, id)
		}
		return binCommand{OperationID: op, Digest: digest([]byte(op + intent)), WriterProtocol: binWriterProtocol, Intent: intent,
			DeletionIDs: deletions, ExpectedVersions: versions, Head: h}
	}
	is := func(err, want error, what string) {
		t.Helper()
		if !errors.Is(err, want) {
			t.Fatalf("%s: got %v, want %v", what, err, want)
		}
	}
	ordinary := func(expected int, source *int) error {
		next := head(expected)
		next.SourceRevision = source
		return s.withFiles(ctx, hostSession, func(a fileAccess) error {
			_, err := a.projectRevision(ctx, project, next)
			return err
		})
	}
	object := uuid(70)

	// Trash a surface: staged chunk, graph head and entry commit together.
	d1 := uuid(1)
	is(oneErr(run(hostSession, trash(uuid(101), d1, "surface", head(0), &object))), errBinIncomplete, "no staged chunk")
	if err := stage(hostSession, d1); err != nil {
		t.Fatal(err)
	}
	is(stage(memberSession, d1), errBinForbidden, "member stages")
	cmd := trash(uuid(101), d1, "surface", head(0), &object)
	first, err := run(hostSession, cmd)
	if err != nil || first.Versions[d1] != 1 || first.Head == nil || first.Head.Revision != 1 {
		t.Fatalf("trash: %+v %v", first, err)
	}
	beforeTrash := 0
	is(ordinary(1, nil), errBinProtocolOutdated, "legacy writer after trash")
	is(ordinary(1, &beforeTrash), errRevisionBinFloor, "rebased snapshot from before trash")
	again, err := run(hostSession, cmd)
	if err != nil || !again.RecoverUntil[d1].Equal(first.RecoverUntil[d1]) {
		t.Fatalf("identical retry: %+v %v", again, err)
	}
	is(oneErr(run(memberSession, cmd)), errBinForbidden, "member replays an owner receipt")
	altered := cmd
	altered.Digest = digest([]byte("altered"))
	is(oneErr(run(hostSession, altered)), errBinDigestMismatch, "altered reuse")
	outdated := trash(uuid(102), uuid(2), "surface", head(1), &object)
	outdated.WriterProtocol = binWriterProtocol - 1
	is(oneErr(run(hostSession, outdated)), errBinProtocolOutdated, "old writer")
	incomplete := trash(uuid(103), uuid(3), "surface", head(1), &object)
	incomplete.Trash.CoverageMissing = []string{"journals"}
	is(oneErr(run(hostSession, incomplete)), errBinIncomplete, "incomplete coverage")
	incomplete.Trash.CoverageMissing = nil
	incomplete.Trash.Assets = []string{uuid(81)}
	is(oneErr(run(hostSession, incomplete)), errBinIncomplete, "missing hosted asset")
	if err := stage(hostSession, uuid(4)); err != nil {
		t.Fatal(err)
	}
	is(oneErr(run(hostSession, trash(uuid(104), uuid(4), "surface", head(0), &object))), errBinStale, "stale head")

	// Catalog: owners and organisation administrators only; listed/member access grants nothing.
	catalog := func(raw string) binCatalog {
		t.Helper()
		var c binCatalog
		if err := s.withFiles(ctx, raw, func(a fileAccess) error {
			var err error
			c, err = a.binCatalog(ctx, org, nil, 100)
			return err
		}); err != nil {
			t.Fatal(err)
		}
		return c
	}
	if c := catalog(memberSession); len(c.Entries) != 0 {
		t.Fatalf("member catalog: %+v", c.Entries)
	}
	if c := catalog(strangerSession); len(c.Entries) != 0 {
		t.Fatalf("stranger catalog: %+v", c.Entries)
	}
	listed := catalog(adminSession)
	if len(listed.Entries) != 2 || listed.Entries[0].DeletionID != d1 || !listed.Entries[1].Legacy ||
		!listed.Entries[1].CoverageLegacy || !listed.Entries[0].Capabilities["restore"].Allowed {
		t.Fatalf("admin catalog: %+v", listed.Entries)
	}
	is(oneErr(run(memberSession, finish(uuid(105), "restore", head(1), map[string]int64{d1: 1}))), errBinForbidden, "member restore")

	// Restore by an organisation administrator, then terminal.
	exec(`UPDATE accounts SET server_features=false WHERE id=$1`, host)
	is(oneErr(run(adminSession, finish(uuid(106), "restore", head(1), map[string]int64{d1: 1}))), errBinHostingUnavailable, "no hosting")
	exec(`UPDATE accounts SET server_features=true WHERE id=$1`, host)
	is(oneErr(run(adminSession, finish(uuid(107), "restore", head(1), map[string]int64{d1: 9}))), errBinStale, "stale version")
	restored, err := run(adminSession, finish(uuid(108), "restore", head(1), map[string]int64{d1: 1}))
	if err != nil || restored.Versions[d1] != 2 || restored.Head.Revision != 2 {
		t.Fatalf("restore: %+v %v", restored, err)
	}
	beforeRestore := 1
	is(ordinary(2, &beforeRestore), errRevisionBinFloor, "rebased snapshot from before restore")
	is(oneErr(run(hostSession, finish(uuid(109), "purge", nil, map[string]int64{d1: 2}))), errBinNotRetained, "terminal")
	is(s.withFiles(ctx, hostSession, func(a fileAccess) error {
		_, err := a.binDetail(ctx, d1)
		return err
	}), errBinNotRetained, "terminal payload")
	var fences, chunks int
	if err := admin.QueryRow(ctx, `SELECT (SELECT count(*) FROM bin_fences WHERE deletion_id=$1),(SELECT count(*) FROM bin_chunks WHERE deletion_id=$1)`, d1).Scan(&fences, &chunks); err != nil || fences != 1 || chunks != 0 {
		t.Fatalf("fence %d chunks %d: %v", fences, chunks, err)
	}

	// A restore and a purge racing on one entry: exactly one commits.
	d5 := uuid(5)
	if err := stage(hostSession, d5); err != nil {
		t.Fatal(err)
	}
	if _, err := run(hostSession, trash(uuid(110), d5, "object", head(2), nil)); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make([]error, 2)
	wg.Go(func() {
		_, results[0] = run(hostSession, finish(uuid(111), "restore", head(3), map[string]int64{d5: 1}))
	})
	wg.Go(func() { _, results[1] = run(adminSession, finish(uuid(112), "purge", nil, map[string]int64{d5: 1})) })
	wg.Wait()
	if (results[0] == nil) == (results[1] == nil) {
		t.Fatalf("race outcomes: %v", results)
	}
	if results[1] == nil {
		beforePurge := 2
		is(ordinary(3, &beforePurge), errRevisionBinFloor, "rebased snapshot after purge")
	}

	// Trash a child, then the whole project; the project purge cascades to the child.
	var revision int
	if err := admin.QueryRow(ctx, `SELECT revision FROM project_revision_heads WHERE project_id=$1`, project).Scan(&revision); err != nil {
		t.Fatal(err)
	}
	// Deadlines hold before the worker runs; the worker then fences and releases, and removes
	// abandoned staging.
	d8 := uuid(8)
	if err := stage(hostSession, d8); err != nil {
		t.Fatal(err)
	}
	if _, err := run(hostSession, trash(uuid(116), d8, "object", head(revision), nil)); err != nil {
		t.Fatal(err)
	}
	revision++
	exec(`UPDATE bin_entries SET recover_until=clock_timestamp()-interval '1 second' WHERE deletion_id=$1`, d8)
	is(oneErr(run(hostSession, finish(uuid(117), "restore", head(revision), map[string]int64{d8: 1}))), errBinExpired, "expired restore")
	is(s.withFiles(ctx, hostSession, func(a fileAccess) error {
		_, err := a.binChunk(ctx, d8, 0)
		return err
	}), errBinExpired, "expired chunk")
	if err := stage(hostSession, uuid(9)); err != nil {
		t.Fatal(err)
	}
	exec(`UPDATE bin_chunks SET staged_at=clock_timestamp()-interval '25 hours' WHERE deletion_id=$1`, uuid(9))
	tx, err := admin.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err := cleanupBin(ctx, tx); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	beforeExpiry := revision - 1
	is(ordinary(revision, &beforeExpiry), errRevisionBinFloor, "rebased snapshot after expiry")
	var state, reason string
	var leftovers int
	if err := admin.QueryRow(ctx, `SELECT state,purge_reason,(SELECT count(*) FROM bin_chunks WHERE deletion_id IN ($1,$2))
 FROM bin_entries WHERE deletion_id=$1`, d8, uuid(9)).Scan(&state, &reason, &leftovers); err != nil || state != "purged" || reason != "expired" || leftovers != 0 {
		t.Fatalf("worker expiry %s %s %d: %v", state, reason, leftovers, err)
	}
	d6, d7 := uuid(6), uuid(7)
	for _, d := range []string{d6, d7} {
		if err := stage(hostSession, d); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := run(hostSession, trash(uuid(113), d6, "surface", head(revision), &object)); err != nil {
		t.Fatal(err)
	}
	if _, err := run(hostSession, trash(uuid(114), d7, "project", nil, nil)); err != nil {
		t.Fatal(err)
	}
	if err := s.withFiles(ctx, hostSession, func(a fileAccess) error { return a.hosts(ctx, project) }); !errors.Is(err, errFileMissing) {
		t.Fatalf("trashed project still accessible: %v", err)
	}
	if c := catalog(hostSession); len(c.Entries) != 3 {
		t.Fatalf("no duplicate legacy row for a Bin project entry: %+v", c.Entries)
	}
	purged, err := run(adminSession, finish(uuid(115), "purge", nil, map[string]int64{d7: 1}))
	if err != nil || len(purged.Cascaded) != 1 || purged.Cascaded[0] != d6 {
		t.Fatalf("project purge: %+v %v", purged, err)
	}
	var due bool
	if err := admin.QueryRow(ctx, `SELECT recover_until<=clock_timestamp() FROM project_deletions WHERE id=$1`, project).Scan(&due); err != nil || !due {
		t.Fatalf("purge deadline: %v %v", due, err)
	}
}

func oneErr(_ binOutcome, err error) error { return err }
