package mailer

import (
	"strings"
	"testing"
)

func TestGreetingByName(t *testing.T) {
	const origin = "https://restore.example"
	_, body := Text(Payload{To: "a@example.test", Language: "en", Purpose: "security", Name: "Anna Kovács"}, origin)
	if !strings.Contains(body, "Hi Anna Kovács,") {
		t.Fatal("English greeting", body)
	}
	_, body = Text(Payload{To: "a@example.test", Language: "hu", Purpose: "reset", Token: "t", Code: "123456", Name: "Kovács Anna"}, origin)
	if !strings.Contains(body, "Kedves Kovács Anna!") {
		t.Fatal("Hungarian greeting", body)
	}
	_, body = Text(Payload{To: "a@example.test", Language: "en", Purpose: "welcome", Name: "Anna"}, origin)
	if !strings.HasPrefix(body, "Welcome to CaliRestore Pro, Anna") || strings.Contains(body, "Hi Anna") {
		t.Fatal("welcome heading", body)
	}
	_, body = Text(Payload{To: "a@example.test", Language: "en", Purpose: "security"}, origin)
	if strings.Contains(body, "Hi ") {
		t.Fatal("greeting without a name", body)
	}
	html := HTML(Payload{To: "a@example.test", Language: "en", Purpose: "security", Name: "<b>Anna</b>"}, origin)
	if strings.Contains(html, "<b>Anna") || !strings.Contains(html, "&lt;b&gt;Anna") {
		t.Fatal("name not escaped in HTML")
	}
}
