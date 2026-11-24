package identity

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/jpeg"
	"strings"
	"testing"
)

// testJPEG is a square photo as the browser sends it: base64 JPEG.
func testJPEG(t *testing.T, side int) string {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, side, side))
	for i := range img.Pix {
		img.Pix[i] = uint8(i)
	}
	img.Set(0, 0, color.White)
	var out bytes.Buffer
	if err := jpeg.Encode(&out, img, nil); err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(out.Bytes())
}

func TestProfileChecks(t *testing.T) {
	for _, test := range []struct {
		in, want string
		ok       bool
	}{
		{"  Kovács   Anna ", "Kovács Anna", true},
		{"", "", true},
		{strings.Repeat("é", 100), strings.Repeat("é", 100), true},
		{strings.Repeat("é", 101), "", false},
		{"Anna\u0007", "", false},
	} {
		if got, ok := profileName(test.in); got != test.want || ok != test.ok {
			t.Errorf("profileName(%q) = %q, %v", test.in, got, ok)
		}
	}
	if photo, err := profilePhoto(testJPEG(t, 256)); err != nil || len(photo) == 0 {
		t.Fatal("valid photo", err)
	}
	if photo, err := profilePhoto(""); err != nil || photo == nil || len(photo) != 0 {
		t.Fatal("empty removes", err)
	}
	for name, encoded := range map[string]string{
		"too small":      testJPEG(t, 8),
		"too large":      testJPEG(t, 1100),
		"not base64":     "***",
		"png":            base64.StdEncoding.EncodeToString([]byte("\x89PNG\r\n\x1a\n")),
		"too many bytes": base64.StdEncoding.EncodeToString(make([]byte, maxPhotoBytes+1)),
	} {
		if _, err := profilePhoto(encoded); err == nil {
			t.Error("accepted", name)
		}
	}
}
