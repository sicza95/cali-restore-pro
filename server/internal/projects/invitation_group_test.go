package projects

import (
	"github.com/sicza95/cali-restore-pro/server/internal/identity"
	"net/http"
	"testing"
)

func TestInvitationRecordsOnlyAGroupOfTheRecipientInTheProjectOrganisation(t *testing.T) {
	f := newVisibilityFixture(t)
	ids, err := identity.New(f.app)
	if err != nil {
		t.Fatal(err)
	}
	if err := ids.ConfigureMail(make([]byte, 32), visibilityOrigin); err != nil {
		t.Fatal(err)
	}
	handler := NewHTTP(f.auth, New(f.app, ids))
	handler.EnableFiles(t.TempDir())
	f.mux = http.NewServeMux()
	handler.Register(f.mux)
	const group = "60000000-0000-4000-8000-000000000033"
	path := "/api/v1/hosted-projects/" + visibilityProject + "/invitations"
	f.exec(`INSERT INTO organisation_groups(id,organisation_id,name,sections) VALUES($1,$2,'Estimator','{}')`, group, f.org)
	body := map[string]any{"email": "other@example.test", "groupId": group, "estimateScope": "none"}
	f.serve(f.request("POST", path, f.owner, body), 400, nil)
	f.exec(`INSERT INTO organisation_member_groups(organisation_id,account_id,group_id) VALUES($1,$2,$3)`, f.org, f.other, group)
	f.serve(f.request("POST", path, f.owner, body), 201, nil)
	var result struct {
		Invitations []ownerInvitation `json:"invitations"`
	}
	f.serve(f.request("GET", path, f.owner, nil), 200, &result)
	if len(result.Invitations) != 1 || result.Invitations[0].GroupName != "Estimator" {
		t.Fatalf("group provenance: %#v", result)
	}
	// The invitation keeps the role it was sent with; later group renames do not change its grant.
	f.exec(`UPDATE organisation_groups SET name='Field technician' WHERE id=$1`, group)
	f.serve(f.request("GET", path, f.owner, nil), 200, &result)
	if result.Invitations[0].GroupName != "Estimator" {
		t.Fatal("invitation role changed with organization group")
	}
}
