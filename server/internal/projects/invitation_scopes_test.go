package projects

import (
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"testing"
)

func TestScopeGrantSize(t *testing.T) {
	key, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	point := base64.StdEncoding.EncodeToString(key.PublicKey().Bytes())
	grant := func(size int) []scopeEnvelope {
		return []scopeEnvelope{{
			Scope:         "estimate-full",
			Encapsulation: point,
			Ciphertext:    base64.StdEncoding.EncodeToString(make([]byte, size)),
		}}
	}
	// Migration 0023 checks length(ciphertext) BETWEEN 24 AND 1048600.
	if scopeGrantMaxChars != 1048600 || len(grant(scopeGrantMaxBytes)[0].Ciphertext) != scopeGrantMaxChars {
		t.Fatalf("scope grant limit %d characters does not match migration 0023", scopeGrantMaxChars)
	}
	for _, c := range []struct {
		size int
		ok   bool
	}{{15, false}, {16, true}, {1763, true}, {scopeGrantMaxBytes, true}, {scopeGrantMaxBytes + 1, false}} {
		if got := validScopeEnvelopes(grant(c.size)); got != c.ok {
			t.Errorf("%d-byte scope grant: valid %v, want %v", c.size, got, c.ok)
		}
	}
	both := append(grant(scopeGrantMaxBytes), scopeEnvelope{
		Scope: "history", Encapsulation: point, Ciphertext: grant(scopeGrantMaxBytes)[0].Ciphertext,
	})
	if !validScopeEnvelopes(both) {
		t.Error("two full-size scope grants rejected")
	}
	if validSealed(base64.StdEncoding.EncodeToString(make([]byte, checkpointGrantMaxBytes+1)), checkpointGrantMaxBytes) {
		t.Error("oversized checkpoint grant accepted")
	}
}
