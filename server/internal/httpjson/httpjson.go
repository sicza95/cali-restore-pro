// Package httpjson holds the JSON response and strict request decoding rules
// shared by every API route.
package httpjson

import (
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"strings"
)

func Respond(w http.ResponseWriter, code int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(value)
}

func Decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	return DecodeBounded(w, r, dst, 4096)
}

func DecodeBounded(w http.ResponseWriter, r *http.Request, dst any, limit int64) bool {
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		Respond(w, 415, map[string]string{"error": "json_required"})
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	var body json.RawMessage
	if err := d.Decode(&body); err != nil {
		Respond(w, 400, map[string]string{"error": "invalid_request"})
		return false
	}
	if len(body) == 0 || body[0] != '{' {
		Respond(w, 400, map[string]string{"error": "invalid_request"})
		return false
	}
	strict := json.NewDecoder(strings.NewReader(string(body)))
	strict.DisallowUnknownFields()
	if err := strict.Decode(dst); err != nil {
		Respond(w, 400, map[string]string{"error": "invalid_request"})
		return false
	}
	if err := d.Decode(new(any)); err != io.EOF {
		Respond(w, 400, map[string]string{"error": "invalid_request"})
		return false
	}
	return true
}

func UUID(value string) bool {
	if len(value) != 36 {
		return false
	}
	for i, c := range value {
		if i == 8 || i == 13 || i == 18 || i == 23 {
			if c != '-' {
				return false
			}
			continue
		}
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f') {
			return false
		}
	}
	return true
}
