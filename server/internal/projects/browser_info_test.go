package projects

import (
	"context"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

func TestBrowserStorageAndHostingRemoval(t *testing.T) {
	f := newVisibilityFixture(t)
	path := "/api/v1/hosted-projects/" + visibilityProject
	var size struct {
		Bytes int64 `json:"bytes"`
	}
	f.serve(f.request("GET", path+"/storage", f.owner, nil), 200, &size)
	if size.Bytes != 0 {
		t.Fatalf("empty storage: %d", size.Bytes)
	}
	const file = "f11e0000-0000-4000-8000-000000000032"
	f.exec(`INSERT INTO encrypted_files(id,project_id,source_bytes,manifest_bytes,state) VALUES($1,$2,1,17,'committed')`, file, visibilityProject)
	f.serve(f.request("GET", path+"/storage", f.owner, nil), 200, &size)
	if size.Bytes != 34 {
		t.Fatalf("charged bytes: %d", size.Bytes)
	}
	f.serve(f.request("GET", path+"/storage", f.other, nil), 404, nil)
	f.serve(f.request("DELETE", path+"/hosting", f.co, map[string]bool{"confirm": true}), 404, nil)
	f.serve(f.request("DELETE", path+"/hosting", f.owner, map[string]bool{"confirm": false}), 400, nil)
	request := f.request("DELETE", path+"/hosting", f.owner, map[string]bool{"confirm": true})
	request.Header.Del("X-CSRF-Token")
	f.serve(request, http.StatusForbidden, nil)
	f.serve(f.request("DELETE", path+"/hosting", f.owner, map[string]bool{"confirm": true}), 204, nil)
	f.serve(f.request("GET", path+"/visibility", f.owner, nil), 404, nil)
	f.serve(f.request("PUT", path, f.other, map[string]string{"organisation": f.org}), 404, nil)
	var queued bool
	if err := f.admin.QueryRow(context.Background(), `SELECT EXISTS(SELECT 1 FROM hosting_removed_files WHERE id=$1)`, file).Scan(&queued); err != nil || !queued {
		t.Fatalf("cleanup not queued: %v", err)
	}
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, file), 0700); err != nil {
		t.Fatal(err)
	}
	if err := New(f.app, nil).PurgeDeleted(context.Background(), root); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, file)); !os.IsNotExist(err) {
		t.Fatalf("file still present: %v", err)
	}
	// Removing hosting is not a trash entry that prevents enabling it again.
	f.serve(f.request("PUT", path, f.owner, map[string]string{"organisation": f.org}), 204, nil)
	f.serve(f.request("GET", path+"/visibility", f.owner, nil), 200, nil)
}

func TestRehostingRetainsFilesThatWereQueuedForCleanup(t *testing.T) {
	f := newVisibilityFixture(t)
	const file = "f11e0000-0000-4000-8000-000000000033"
	path := "/api/v1/hosted-projects/" + visibilityProject
	f.exec(`INSERT INTO encrypted_files(id,project_id,source_bytes,manifest_bytes,state) VALUES($1,$2,1,17,'committed')`, file, visibilityProject)
	f.serve(f.request("DELETE", path+"/hosting", f.owner, map[string]bool{"confirm": true}), 204, nil)
	f.serve(f.request("PUT", path, f.owner, map[string]string{"organisation": f.org}), 204, nil)
	f.serve(f.request("PUT", path+"/files/"+file, f.owner, map[string]int{"sourceBytes": 1, "manifestBytes": 17}), 200, nil)
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, file), 0700); err != nil {
		t.Fatal(err)
	}
	if err := New(f.app, nil).PurgeDeleted(context.Background(), root); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, file)); err != nil {
		t.Fatalf("rehosted file was removed: %v", err)
	}
}
