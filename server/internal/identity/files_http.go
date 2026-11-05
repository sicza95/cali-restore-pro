package identity

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"strconv"
)

func fileFailure(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errFileMissing):
		respond(w, 404, map[string]string{"error": "not_found"})
	case errors.Is(err, errFileQuota):
		respond(w, 409, map[string]string{"error": "storage_quota_exceeded"})
	case errors.Is(err, errFileState):
		respond(w, 409, map[string]string{"error": "file_conflict"})
	default:
		failure(w, err)
	}
}

func (h *HTTP) fileRoutes(route func(string, bool, http.HandlerFunc), objects fileObjects) {
	const projects = "/api/v1/hosted-projects/{project}"
	const files = projects + "/files/{file}"
	const parts = files + "/parts/{part}"
	const shared = "/api/v1/invitations/{invitation}/files/{file}"
	gate := make(chan struct{}, 4)
	handle := func(pattern string, fn func(http.ResponseWriter, *http.Request, fileAccess, string, string) (func(), error)) {
		route(pattern, true, func(w http.ResponseWriter, r *http.Request) {
			project, id := r.PathValue("project"), r.PathValue("file")
			invitation := r.PathValue("invitation")
			if invitation != "" && (!uuid(invitation) || !uuid(id)) ||
				invitation == "" && (!uuid(project) || id != "" && !uuid(id)) {
				failure(w, ErrInvalid)
				return
			}
			select {
			case gate <- struct{}{}:
				defer func() { <-gate }()
			default:
				respond(w, 429, map[string]string{"error": "transfer_busy"})
				return
			}
			var reply func()
			err := h.service.withFiles(r.Context(), h.raw(r), func(a fileAccess) error {
				if invitation != "" {
					var err error
					project, err = a.sharedFileProject(r.Context(), invitation, id)
					if err != nil {
						return err
					}
				} else if pattern != "PUT "+projects {
					if err := a.hosts(r.Context(), project); err != nil {
						return err
					}
				}
				var err error
				reply, err = fn(w, r, a, project, id)
				return err
			})
			if err != nil {
				fileFailure(w, err)
				return
			}
			if reply != nil {
				reply()
			}
		})
	}
	empty := func(w http.ResponseWriter) func() { return func() { w.WriteHeader(http.StatusNoContent) } }
	handle("PUT "+projects, func(w http.ResponseWriter, r *http.Request, a fileAccess, project, _ string) (func(), error) {
		var b struct{}
		if !decode(w, r, &b) {
			return nil, nil
		}
		if err := a.hosts(r.Context(), project); err == nil {
			return empty(w), nil
		} else if !errors.Is(err, errFileMissing) {
			return nil, err
		}
		if !a.hosting || a.quota == 0 {
			return nil, ErrForbidden
		}
		tag, err := a.tx.Exec(r.Context(), `WITH created AS (
 INSERT INTO hosted_projects(id,host_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id,host_id
 )
 INSERT INTO project_owners(project_id,account_id) SELECT id,host_id FROM created`, project, a.account)
		if err == nil && tag.RowsAffected() == 0 {
			err = errFileMissing
		}
		return empty(w), err
	})
	handle("PUT "+files, func(w http.ResponseWriter, r *http.Request, a fileAccess, project, id string) (func(), error) {
		var shape fileShape
		if !decode(w, r, &shape) {
			return nil, nil
		}
		if !shape.valid() {
			return nil, ErrInvalid
		}
		record, err := a.reserve(r.Context(), project, id, shape)
		return func() { respond(w, 200, record) }, err
	})
	readFile := func(w http.ResponseWriter, r *http.Request, a fileAccess, project, id string) (func(), error) {
		f, err := a.record(r.Context(), project, id)
		if err == nil && f.State != "committed" {
			err = errFileMissing
		}
		return func() { respond(w, 200, f) }, err
	}
	handle("GET "+files, readFile)
	handle("GET "+shared, readFile)
	handle("DELETE "+files, func(w http.ResponseWriter, r *http.Request, a fileAccess, project, id string) (func(), error) {
		f, err := a.record(r.Context(), project, id)
		if errors.Is(err, errFileMissing) {
			return empty(w), nil
		}
		if err != nil {
			return nil, err
		}
		if f.State == "committed" {
			return nil, errFileState
		}
		_, err = a.tx.Exec(r.Context(), `UPDATE encrypted_files SET state='cancelled',expires_at=clock_timestamp() WHERE id=$1`, id)
		return empty(w), err
	})
	handle("POST "+files+"/commit", func(w http.ResponseWriter, r *http.Request, a fileAccess, project, id string) (func(), error) {
		var b struct{}
		if !decode(w, r, &b) {
			return nil, nil
		}
		f, err := a.record(r.Context(), project, id)
		if err != nil {
			return nil, err
		}
		if f.State == "committed" {
			return empty(w), nil
		}
		if f.State != "staged" || f.expired {
			return nil, errFileState
		}
		if err := a.checkGrowth(r.Context()); err != nil {
			return nil, err
		}
		return empty(w), a.publish(r.Context(), objects, id, f)
	})
	handle("PUT "+parts, func(w http.ResponseWriter, r *http.Request, a fileAccess, project, id string) (func(), error) {
		f, part, size, err := requestedPart(r, a, project, id)
		if err != nil {
			return nil, err
		}
		if f.State != "staged" || f.expired {
			return nil, errFileState
		}
		if err := a.checkGrowth(r.Context()); err != nil {
			return nil, err
		}
		if r.Header.Get("Content-Type") != "application/octet-stream" {
			return nil, ErrInvalid
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, int64(size)))
		if err != nil || len(body) != size {
			return nil, ErrInvalid
		}
		hash := sha256.Sum256(body)
		if r.Header.Get("X-Ciphertext-SHA256") != hex.EncodeToString(hash[:]) {
			return nil, ErrInvalid
		}
		return empty(w), a.putPart(r.Context(), objects, id, part, body)
	})
	readPart := func(w http.ResponseWriter, r *http.Request, a fileAccess, project, id string) (func(), error) {
		f, part, size, err := requestedPart(r, a, project, id)
		if err != nil {
			return nil, err
		}
		if f.State != "committed" {
			return nil, errFileMissing
		}
		var digest []byte
		if err := a.tx.QueryRow(r.Context(), `SELECT digest FROM encrypted_parts WHERE file_id=$1 AND part=$2`, id, part).Scan(&digest); err != nil {
			return nil, err
		}
		body, err := objects.read(id, part, size, digest)
		return func() {
			w.Header().Set("Content-Type", "application/octet-stream")
			w.Header().Set("X-Ciphertext-SHA256", hex.EncodeToString(digest))
			_, _ = w.Write(body)
		}, err
	}
	handle("GET "+parts, readPart)
	handle("GET "+shared+"/parts/{part}", readPart)
}

func requestedPart(r *http.Request, a fileAccess, project, id string) (fileRecord, int, int, error) {
	value := r.PathValue("part")
	part, err := strconv.Atoi(value)
	if err != nil || strconv.Itoa(part) != value || part < 0 || part > 256 {
		return fileRecord{}, 0, 0, ErrInvalid
	}
	f, err := a.record(r.Context(), project, id)
	if err != nil {
		return f, 0, 0, err
	}
	size := f.partSize(part)
	if size == 0 {
		return f, 0, 0, errFileMissing
	}
	return f, part, size, nil
}
