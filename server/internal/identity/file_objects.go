package identity

import (
	"bytes"
	"crypto/sha256"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strconv"
)

// Object paths are constructed exclusively from validated, canonical IDs and
// bounded part indices. The volume is private to the app and worker.
type fileObjects struct{ root string }

func (o fileObjects) put(id string, part int, body []byte) error {
	dir := filepath.Join(o.root, id)
	if err := os.Mkdir(dir, 0700); err != nil && !errors.Is(err, os.ErrExist) {
		return err
	}
	tmp := filepath.Join(dir, strconv.Itoa(part)+".tmp")
	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	defer os.Remove(tmp)
	_, err = f.Write(body)
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if err := os.Rename(tmp, filepath.Join(dir, strconv.Itoa(part))); err != nil {
		return err
	}
	if err := syncFileDirectory(dir); err != nil {
		return err
	}
	return syncFileDirectory(o.root)
}

func syncFileDirectory(dir string) error {
	f, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer f.Close()
	return f.Sync()
}

func (o fileObjects) read(id string, part, size int, digest []byte) ([]byte, error) {
	f, err := os.Open(filepath.Join(o.root, id, strconv.Itoa(part)))
	if err != nil {
		return nil, err
	}
	defer f.Close()
	body, err := io.ReadAll(io.LimitReader(f, int64(size)+1))
	hash := sha256.Sum256(body)
	if err != nil || len(body) != size || !bytes.Equal(hash[:], digest) {
		return nil, errors.New("object integrity failure")
	}
	return body, nil
}
