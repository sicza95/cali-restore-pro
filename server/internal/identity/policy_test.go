package identity

import "testing"

func TestLeastPrivilege(t *testing.T) {
	for _, role := range []string{"member", "administrator", "superuser", "unknown"} {
		for _, state := range []string{"active", "pending_verification", "suspended", "pending_deletion"} {
			a := Account{Role: role, State: state}
			if a.Allows(OwnSecurity) != (state == "active" && role != "unknown") {
				t.Fatal(a)
			}
			if a.Allows(ManageRoles) != (state == "active" && role == "superuser") {
				t.Fatal(a)
			}
			if a.Allows(SuspendAccounts) != (state == "active" && role == "superuser") {
				t.Fatal(a)
			}
			for _, forbidden := range []Capability{"project.read", "project.write", "content.decrypt", "hosting.create", "unknown"} {
				if a.Allows(forbidden) {
					t.Fatal("platform role grants content/hosting permission")
				}
			}
		}
	}
}
