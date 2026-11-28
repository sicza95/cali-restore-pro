package projects

import (
	"context"
	"encoding/base64"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/sicza95/cali-restore-pro/server/internal/httpjson"
)

type binCursor struct {
	at time.Time
	id string
}

func encodeBinCursor(c binCursor) string {
	return base64.RawURLEncoding.EncodeToString([]byte(strconv.FormatInt(c.at.UnixMicro(), 10) + "|" + c.id))
}

func decodeBinCursor(text string) (*binCursor, bool) {
	if text == "" {
		return nil, true
	}
	raw, err := base64.RawURLEncoding.DecodeString(text)
	if err != nil {
		return nil, false
	}
	at, id, ok := strings.Cut(string(raw), "|")
	micros, err := strconv.ParseInt(at, 10, 64)
	if !ok || err != nil || !httpjson.UUID(id) {
		return nil, false
	}
	return &binCursor{at: time.UnixMicro(micros), id: id}, true
}

var hexDigest = regexp.MustCompile(`^[0-9a-f]{64}$`)

// binFailure maps typed Bin failures to precise responses instead of a generic retry message.
func binFailure(w http.ResponseWriter, err error) {
	if code := binFailureCode(err); code != "" {
		status := 409
		if code == "forbidden" {
			status = 403
		}
		httpjson.Respond(w, status, map[string]string{"error": code})
		return
	}
	fileFailure(w, err)
}

type binDetail struct {
	binCatalogEntry
	Manifest revisionCiphertext `json:"manifest"`
}

func (a fileAccess) binDetail(ctx context.Context, deletion string) (binDetail, error) {
	var d binDetail
	var display revisionCiphertext
	err := a.tx.QueryRow(ctx, `SELECT deletion_id::text,project_id::text,entity_kind,entity_id::text,object_id::text,state,version,deleted_at,
 deleted_by::text,recover_until,manifest_schema,manifest_sha256,coverage_missing,coverage_legacy,source_revision,logical_bytes,chunk_count,
 display_salt,display_ciphertext,manifest_salt,manifest_ciphertext FROM bin_entries WHERE deletion_id=$1`, deletion).
		Scan(&d.DeletionID, &d.ProjectID, &d.EntityKind, &d.EntityID, &d.ObjectID, &d.State, &d.Version, &d.DeletedAt, &d.DeletedBy,
			&d.RecoverUntil, &d.ManifestSchema, &d.ManifestSHA256, &d.CoverageMissing, &d.CoverageLegacy, &d.SourceRevision,
			&d.LogicalBytes, &d.ChunkCount, &display.Salt, &display.Ciphertext, &d.Manifest.Salt, &d.Manifest.Ciphertext)
	if errors.Is(err, pgx.ErrNoRows) {
		return d, errFileMissing
	}
	if err != nil {
		return d, err
	}
	// Recheck the current role on every payload read: revocation ends access at once.
	actor, err := a.binManager(ctx, d.ProjectID)
	if err != nil {
		return d, err
	}
	now, err := a.now(ctx)
	if err != nil {
		return d, err
	}
	if err := binPayloadAvailable(d.State, d.RecoverUntil, now); err != nil {
		return d, err
	}
	d.Display = &display
	d.Capabilities = capabilitiesOf(d.facts(), actor, now)
	return d, nil
}

func (h *HTTP) binRoutes(route func(string, bool, http.HandlerFunc)) {
	route("GET /api/v1/organisations/{org}/bin", true, func(w http.ResponseWriter, r *http.Request) {
		org := r.PathValue("org")
		limit, err := strconv.Atoi(r.URL.Query().Get("limit"))
		if r.URL.Query().Get("limit") == "" {
			limit, err = 100, nil
		}
		cursor, ok := decodeBinCursor(r.URL.Query().Get("before"))
		if !httpjson.UUID(org) || err != nil || limit < 1 || limit > 500 || !ok {
			binFailure(w, errBinIncomplete)
			return
		}
		var result binCatalog
		err = h.service.withFiles(r.Context(), h.raw(r), func(a fileAccess) error {
			var err error
			result, err = a.binCatalog(r.Context(), org, cursor, limit)
			return err
		})
		if err != nil {
			binFailure(w, err)
			return
		}
		httpjson.Respond(w, 200, result)
	})
	route("GET /api/v1/bin/{deletion}", true, func(w http.ResponseWriter, r *http.Request) {
		deletion := r.PathValue("deletion")
		if !httpjson.UUID(deletion) {
			binFailure(w, errFileMissing)
			return
		}
		var result binDetail
		err := h.service.withFiles(r.Context(), h.raw(r), func(a fileAccess) error {
			var err error
			result, err = a.binDetail(r.Context(), deletion)
			return err
		})
		if err != nil {
			binFailure(w, err)
			return
		}
		httpjson.Respond(w, 200, result)
	})
	route("GET /api/v1/bin/{deletion}/chunks/{index}", true, func(w http.ResponseWriter, r *http.Request) {
		deletion := r.PathValue("deletion")
		index, err := strconv.Atoi(r.PathValue("index"))
		if !httpjson.UUID(deletion) || err != nil || index < 0 || index > 63 {
			binFailure(w, errFileMissing)
			return
		}
		var body []byte
		err = h.service.withFiles(r.Context(), h.raw(r), func(a fileAccess) error {
			var err error
			body, err = a.binChunk(r.Context(), deletion, index)
			return err
		})
		if err != nil {
			binFailure(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(body)
	})
	route("PUT /api/v1/hosted-projects/{project}/bin/staging/{deletion}/{index}", true, func(w http.ResponseWriter, r *http.Request) {
		project, deletion := r.PathValue("project"), r.PathValue("deletion")
		index, err := strconv.Atoi(r.PathValue("index"))
		var body struct {
			SHA256 string `json:"sha256"`
			Body   []byte `json:"body"`
		}
		if !httpjson.UUID(project) || !httpjson.UUID(deletion) || err != nil || index < 0 || index > 63 {
			binFailure(w, errBinIncomplete)
			return
		}
		if !httpjson.DecodeBounded(w, r, &body, 1536*1024) {
			return
		}
		if !hexDigest.MatchString(body.SHA256) || len(body.Body) < 1 || len(body.Body) > 1048576 {
			binFailure(w, errBinIncomplete)
			return
		}
		err = h.service.withFiles(r.Context(), h.raw(r), func(a fileAccess) error {
			return a.stageBinChunk(r.Context(), project, deletion, index, body.SHA256, body.Body)
		})
		if err != nil {
			binFailure(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	route("POST /api/v1/hosted-projects/{project}/bin/operations", true, func(w http.ResponseWriter, r *http.Request) {
		project := r.PathValue("project")
		var cmd binCommand
		if !httpjson.UUID(project) {
			binFailure(w, errBinIncomplete)
			return
		}
		if !httpjson.DecodeBounded(w, r, &cmd, 1200*1024) {
			return
		}
		if !validBinCommand(cmd) {
			binFailure(w, errBinIncomplete)
			return
		}
		var outcome binOutcome
		err := h.service.withFileLock(r.Context(), h.raw(r), lifecycleWriteLock, func(a fileAccess) error {
			var err error
			outcome, err = a.binExecute(r.Context(), project, cmd)
			return err
		})
		if err != nil {
			binFailure(w, err)
			return
		}
		httpjson.Respond(w, 200, outcome)
	})
}

func validBinCommand(cmd binCommand) bool {
	if !httpjson.UUID(cmd.OperationID) || !hexDigest.MatchString(cmd.Digest) {
		return false
	}
	if cmd.Head != nil && (cmd.Head.Expected == nil || !httpjson.UUID(cmd.Head.Epoch) || len(cmd.Head.Salt) != 32 ||
		len(cmd.Head.Ciphertext) < 16 || len(cmd.Head.Ciphertext) > 65552) {
		return false
	}
	for _, id := range cmd.DeletionIDs {
		if !httpjson.UUID(id) {
			return false
		}
	}
	t := cmd.Trash
	if cmd.Intent != "trash" {
		return t == nil && len(cmd.DeletionIDs) > 0
	}
	if t == nil || !httpjson.UUID(t.DeletionID) || !httpjson.UUID(t.EntityID) || !hexDigest.MatchString(t.ManifestSHA256) ||
		t.ManifestSchema < 1 || t.SourceRevision < 0 || t.LogicalBytes < 0 || t.ChunkCount < 1 || t.ChunkCount > 64 || len(t.Assets) > 10000 ||
		len(t.Display.Salt) != 32 || len(t.Manifest.Salt) != 32 || len(t.Display.Ciphertext) < 16 || len(t.Manifest.Ciphertext) < 16 {
		return false
	}
	for _, id := range t.Assets {
		if !httpjson.UUID(id) {
			return false
		}
	}
	switch t.EntityKind {
	case "project", "object":
		return t.ObjectID == nil
	case "surface":
		return t.ObjectID != nil && httpjson.UUID(*t.ObjectID)
	}
	return false
}
