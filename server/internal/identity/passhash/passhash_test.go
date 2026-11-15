package passhash

import (
	"strings"
	"testing"
)

func TestPasswordVerifier(t *testing.T) {
	password := "árvíztűrő tükörfúrógép"
	first, err := Hash(password)
	if err != nil {
		t.Fatal(err)
	}
	second, err := Hash(password)
	if err != nil || first == second {
		t.Fatal("salt not unique", err)
	}
	if !Verify(first, password) || Verify(first, "a different password") {
		t.Fatal("incorrect password verification")
	}
	for _, corrupt := range []string{"", "$argon2id$v=19$m=999999999,t=2,p=1$bad$bad", hashPrefix + "bad$bad", first + "$extra"} {
		if Verify(corrupt, password) {
			t.Fatal("malformed verifier accepted")
		}
	}
	for _, invalid := range []string{"short", strings.Repeat("x", 1025), string([]byte{255})} {
		if _, err := Hash(invalid); err == nil {
			t.Fatal("invalid password accepted")
		}
	}
}
