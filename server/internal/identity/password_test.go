package identity

import (
	"strings"
	"testing"
)

func TestPasswordVerifier(t *testing.T) {
	password := "árvíztűrő tükörfúrógép"
	first, err := HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	second, err := HashPassword(password)
	if err != nil || first == second {
		t.Fatal("salt not unique", err)
	}
	if !VerifyPassword(first, password) || VerifyPassword(first, "a different password") {
		t.Fatal("incorrect password verification")
	}
	for _, corrupt := range []string{"", "$argon2id$v=19$m=999999999,t=2,p=1$bad$bad", hashPrefix + "bad$bad", first + "$extra"} {
		if VerifyPassword(corrupt, password) {
			t.Fatal("malformed verifier accepted")
		}
	}
	for _, invalid := range []string{"short", strings.Repeat("x", 1025), string([]byte{255})} {
		if _, err := HashPassword(invalid); err == nil {
			t.Fatal("invalid password accepted")
		}
	}
}

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
			if a.Allows(SuspendAccounts) != (state == "active" && (role == "superuser" || role == "administrator")) {
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
