package identity

import (
	"bytes"
	"context"
	"crypto/sha256"
	"errors"
	"os"
	"path/filepath"

	"github.com/jackc/pgx/v5"
)

const fileChunkSize = 1 << 20
const maxSourceBytes = 256 * fileChunkSize

var (
	errFileMissing             = errors.New("file missing")
	errFileQuota               = errors.New("storage quota exceeded")
	errFileState               = errors.New("file state conflict")
	errOriginalRotationPending = errors.New("original key rotation pending")
)

type fileShape struct {
	SourceBytes   int `json:"sourceBytes"`
	ManifestBytes int `json:"manifestBytes"`
}

func (f fileShape) valid() bool {
	return f.SourceBytes > 0 && f.SourceBytes <= maxSourceBytes && f.ManifestBytes >= 17 && f.ManifestBytes <= 16384
}
func (f fileShape) chunks() int { return (f.SourceBytes + fileChunkSize - 1) / fileChunkSize }
func (f fileShape) partSize(part int) int {
	if part == 0 {
		return f.ManifestBytes
	}
	if part < 0 || part > f.chunks() {
		return 0
	}
	return min(fileChunkSize, f.SourceBytes-(part-1)*fileChunkSize) + 16
}
func (f fileShape) charge() int64 { return int64(f.SourceBytes + f.chunks()*16 + f.ManifestBytes) }

type fileRecord struct {
	fileShape
	State   string `json:"state"`
	expired bool
}

type fileAccess struct {
	tx      pgx.Tx
	account string
	hosting bool
	quota   int64
}

func (s *Service) withFiles(ctx context.Context, raw string, fn func(fileAccess) error) error {
	if !validToken(raw) {
		return ErrUnauthorized
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	var a fileAccess
	a.tx = tx
	var state string
	// Serialize quota and suspension changes while allowing foreign-key checks.
	err = tx.QueryRow(ctx, `SELECT a.id,a.state,a.server_features,a.quota_mib::bigint*1048576
 FROM accounts a JOIN sessions s ON s.account_id=a.id WHERE s.token_digest=$1 FOR NO KEY UPDATE OF a`, digest(raw)).
		Scan(&a.account, &state, &a.hosting, &a.quota)
	if errors.Is(err, pgx.ErrNoRows) || err == nil && state != "active" {
		return ErrUnauthorized
	}
	if err != nil {
		return err
	}
	// Recheck after taking the account lock. Serialize with session-only logout.
	var locked int
	err = tx.QueryRow(ctx, `SELECT 1 FROM sessions WHERE token_digest=$1 AND account_id=$2 FOR SHARE`, digest(raw), a.account).Scan(&locked)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrUnauthorized
	}
	if err != nil {
		return err
	}
	if err := fn(a); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (a fileAccess) hosts(ctx context.Context, project string) error {
	// Keep the host and quota attribution stable until this file operation commits.
	if _, err := a.tx.Exec(ctx, `SELECT pg_advisory_xact_lock_shared(hashtextextended($1, 6011))`, project); err != nil {
		return err
	}
	var found int
	err := a.tx.QueryRow(ctx, `SELECT 1 FROM hosted_projects WHERE id=$1 AND host_id=$2`, project, a.account).Scan(&found)
	if errors.Is(err, pgx.ErrNoRows) {
		return errFileMissing
	}
	return err
}

func (a fileAccess) sharedFileProject(ctx context.Context, invitation, file string) (string, error) {
	var project string
	const authorized = `SELECT i.project_id FROM invitation_originals o
 JOIN project_invitations i ON i.id=o.invitation_id
 JOIN accounts r ON r.id=i.recipient_id
 WHERE i.id=$1 AND o.file_id=$2 AND i.recipient_id=$3 AND i.state='active' AND r.email=i.recipient_email`
	err := a.tx.QueryRow(ctx, authorized, invitation, file, a.account).Scan(&project)
	if err == nil {
		if _, err = a.tx.Exec(ctx, `SELECT pg_advisory_xact_lock_shared(hashtextextended($1, 6011))`, project); err == nil {
			// A revoke or rotation may have committed while we waited.
			err = a.tx.QueryRow(ctx, authorized, invitation, file, a.account).Scan(&project)
		}
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return "", errFileMissing
	}
	return project, err
}

func (a fileAccess) record(ctx context.Context, project, id string) (fileRecord, error) {
	var f fileRecord
	err := a.tx.QueryRow(ctx, `SELECT source_bytes,manifest_bytes,state,expires_at<=clock_timestamp()
 FROM encrypted_files WHERE id=$1 AND project_id=$2 FOR UPDATE`, id, project).
		Scan(&f.SourceBytes, &f.ManifestBytes, &f.State, &f.expired)
	if errors.Is(err, pgx.ErrNoRows) {
		return f, errFileMissing
	}
	return f, err
}

func (a fileAccess) usage(ctx context.Context) (int64, error) {
	var used int64
	err := a.tx.QueryRow(ctx, `SELECT coalesce(sum(f.charged_bytes),0)::bigint
 FROM encrypted_files f JOIN hosted_projects p ON p.id=f.project_id
 WHERE p.host_id=$1`, a.account).Scan(&used)
	return used, err
}

func (a fileAccess) reserve(ctx context.Context, project, id string, shape fileShape) (fileRecord, error) {
	f, err := a.record(ctx, project, id)
	if err == nil {
		if f.fileShape != shape || f.State == "cancelled" || f.State == "staged" && f.expired {
			return f, errFileState
		}
		if f.State == "staged" {
			return f, a.checkGrowth(ctx)
		}
		return f, nil
	}
	if !errors.Is(err, errFileMissing) {
		return f, err
	}
	if !a.hosting {
		return f, ErrForbidden
	}
	used, err := a.usage(ctx)
	if err != nil {
		return f, err
	}
	if used+shape.charge() > a.quota {
		return f, errFileQuota
	}
	tag, err := a.tx.Exec(ctx, `INSERT INTO encrypted_files(id,project_id,source_bytes,manifest_bytes) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, id, project, shape.SourceBytes, shape.ManifestBytes)
	if err == nil && tag.RowsAffected() == 0 {
		return f, errFileState
	}
	return fileRecord{fileShape: shape, State: "staged"}, err
}

func (a fileAccess) checkGrowth(ctx context.Context) error {
	if !a.hosting {
		return ErrForbidden
	}
	used, err := a.usage(ctx)
	if err == nil && used > a.quota {
		return errFileQuota
	}
	return err
}

func (a fileAccess) putPart(ctx context.Context, o fileObjects, id string, part int, body []byte) error {
	hash := sha256.Sum256(body)
	var expected []byte
	err := a.tx.QueryRow(ctx, `SELECT digest FROM encrypted_parts WHERE file_id=$1 AND part=$2`, id, part).Scan(&expected)
	if err == nil {
		if !bytes.Equal(expected, hash[:]) {
			return errFileState
		}
		if _, err := o.read(id, part, len(body), expected); err == nil {
			return nil
		}
		// Repair a staged object only with the identical bytes.
		return o.put(id, part, body)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if err := o.put(id, part, body); err != nil {
		return err
	}
	_, err = a.tx.Exec(ctx, `INSERT INTO encrypted_parts(file_id,part,digest) VALUES ($1,$2,$3)`, id, part, hash[:])
	return err
}

func (a fileAccess) publish(ctx context.Context, o fileObjects, id string, f fileRecord) error {
	rows, err := a.tx.Query(ctx, `SELECT part,digest FROM encrypted_parts WHERE file_id=$1 ORDER BY part`, id)
	if err != nil {
		return err
	}
	defer rows.Close()
	next := 0
	for rows.Next() {
		if err := ctx.Err(); err != nil {
			return err
		}
		var part int
		var hash []byte
		if err := rows.Scan(&part, &hash); err != nil {
			return err
		}
		if part != next || f.partSize(part) == 0 {
			return errFileState
		}
		if _, err := o.read(id, part, f.partSize(part), hash); err != nil {
			return errFileState
		}
		next++
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if next != f.chunks()+1 {
		return errFileState
	}
	tag, err := a.tx.Exec(ctx, `UPDATE encrypted_files SET state='committed' WHERE id=$1 AND expires_at>clock_timestamp()`, id)
	if err == nil && tag.RowsAffected() != 1 {
		return errFileState
	}
	return err
}

// CleanExpiredFiles claims one abandoned upload. Its row remains the durable
// cleanup job until the bytes have been removed, including after worker failure.
func (s *Service) CleanExpiredFiles(ctx context.Context, root string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	var id string
	err = tx.QueryRow(ctx, `SELECT id FROM encrypted_files WHERE state<>'committed' AND expires_at<=clock_timestamp()
 ORDER BY expires_at LIMIT 1 FOR UPDATE SKIP LOCKED`).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if !uuid(id) {
		return ErrInvalid
	}
	if err := os.RemoveAll(filepath.Join(root, id)); err != nil {
		return err
	}
	if err := syncFileDirectory(root); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM encrypted_files WHERE id=$1`, id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
