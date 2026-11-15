// Package sessiontoken holds the opaque session token format, its stored
// digest and the CSRF value derived from it.
package sessiontoken

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
)

func New() string {
	b := make([]byte, 32)
	// crypto/rand.Read never returns an error in the supported Go runtime.
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func Digest(raw string) []byte {
	sum := sha256.Sum256([]byte(raw))
	return sum[:]
}

func Valid(raw string) bool {
	b, err := base64.RawURLEncoding.DecodeString(raw)
	return err == nil && len(b) == 32 && base64.RawURLEncoding.EncodeToString(b) == raw
}

func CSRF(raw string) string { return base64.RawURLEncoding.EncodeToString(Digest("csrf:" + raw)) }
