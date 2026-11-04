package identity

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"strings"
	"unicode/utf8"

	"golang.org/x/crypto/argon2"
)

const hashPrefix = "$argon2id$v=19$m=19456,t=2,p=1$"

func validPassword(password string) bool {
	return utf8.ValidString(password) && utf8.RuneCountInString(password) >= 15 && len(password) <= 1024
}

func HashPassword(password string) (string, error) {
	if !validPassword(password) {
		return "", errors.New("password must contain at least 15 characters and at most 1024 bytes")
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	hash := argon2.IDKey([]byte(password), salt, 2, 19456, 1, 32)
	return hashPrefix + base64.RawStdEncoding.EncodeToString(salt) + "$" + base64.RawStdEncoding.EncodeToString(hash), nil
}

// Only the fixed, reviewed parameters are accepted. Database corruption cannot
// request unbounded Argon2 memory or CPU through a verifier string.
func VerifyPassword(verifier, password string) bool {
	if !validPassword(password) || !strings.HasPrefix(verifier, hashPrefix) {
		return false
	}
	parts := strings.Split(strings.TrimPrefix(verifier, hashPrefix), "$")
	if len(parts) != 2 {
		return false
	}
	salt, e1 := base64.RawStdEncoding.DecodeString(parts[0])
	expected, e2 := base64.RawStdEncoding.DecodeString(parts[1])
	if e1 != nil || e2 != nil || len(salt) != 16 || len(expected) != 32 {
		return false
	}
	actual := argon2.IDKey([]byte(password), salt, 2, 19456, 1, 32)
	return subtle.ConstantTimeCompare(actual, expected) == 1
}
