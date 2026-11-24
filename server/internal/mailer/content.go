package mailer

import (
	"net/url"
	"strings"
)

// Code is the six-digit code sent beside a verify or reset link. Name is the
// account's full name when it has one; every email then greets it.
type Payload struct{ To, Language, Purpose, Token, Code, Name string }

// Letter is one account email before rendering: the plain-text and HTML parts
// are both built from it, so they always say the same thing.
type Letter struct {
	Subject, Preheader, Heading string
	Paragraphs                  []string
	// CodeLabel introduces Code; both are empty for mail without a code.
	CodeLabel, Code string
	// Action is a button in HTML and a link in text; ActionLead introduces it.
	ActionLead, Action, URL string
	Note                    string
}

type words struct {
	codeSubject, codeLabel, or, ignore string
	// greeting and welcomeNamed hold {name}.
	greeting, welcomeNamed              string
	verify, notRegistered, reset        [4]string // heading, intro, button, note
	exists, email, security, invite     [4]string
	welcome, passwordReset, passwordSet [4]string
}

// Mail contains no restoration/project information. Links use fragments, so
// browsers do not send the secret to proxies or static request logs.
var catalogue = map[string]words{
	"en": {
		codeSubject:  " is your CaliRestore Pro code",
		greeting:     "Hi {name},",
		welcomeNamed: "Welcome to CaliRestore Pro, {name}",
		codeLabel:    "Your verification code",
		or:           "Or continue with one click:",
		ignore:       "The code and the link work for 15 minutes.",
		verify: [4]string{"Finish creating your account",
			"Enter this code on the Create account page to choose your password.",
			"Choose a password",
			"If you didn’t ask to create an account, ignore this email. Nothing is created until a password is chosen."},
		notRegistered: [4]string{"You don’t have an account yet",
			"Someone asked to reset the password for this address, but there is no CaliRestore Pro account with it. If it was you, you can create one now: enter this code on the page where you asked.",
			"Create my account",
			"If you didn’t ask for this, ignore this email. Nothing is created until a password is chosen."},
		reset: [4]string{"Reset your password",
			"Enter this code on the Can’t sign in page to choose a new password.",
			"Choose a new password",
			"A new password signs you out everywhere and removes your passkeys. If you didn’t ask for this, ignore this email: your password stays the same."},
		exists: [4]string{"You already have an account",
			"Someone tried to create a CaliRestore Pro account with this email address, but you already have one. Sign in, or choose “Can’t sign in?” to reset your password.",
			"Sign in",
			"If this wasn’t you, you can ignore this email."},
		email: [4]string{"Confirm your new email address",
			"Confirm this address to use it for signing in to CaliRestore Pro.",
			"Confirm email address",
			"The link works for 30 minutes. If you didn’t ask for this change, ignore this email."},
		security: [4]string{"Your account security changed",
			"A security change was requested or completed for your CaliRestore Pro account.",
			"",
			"If this wasn’t you, reset your password or contact your operator."},
		invite: [4]string{"You’re invited to a project",
			"You received a CaliRestore Pro project invitation. Sign in with this email address to see pending invitations.",
			"See invitations",
			""},
		welcome: [4]string{"Welcome to CaliRestore Pro",
			"Your account is ready and you are signed in. Next time, sign in with this email address and the password you chose. You can also add a passkey on the Account security page, so this device signs you in without a password.",
			"Open CaliRestore Pro",
			"You get this email because an account was created with this address. If it wasn’t you, reset the password and contact your operator."},
		passwordReset: [4]string{"Your password was changed",
			"The password for your CaliRestore Pro account was reset with a code sent to this address. You were signed out on your other devices, and your passkeys were removed: add them again on the Account security page.",
			"Reset password",
			"If this was you, there is nothing else to do. If it wasn’t, reset your password now and contact your operator."},
		passwordSet: [4]string{"Your password was changed",
			"The password for your CaliRestore Pro account was changed on the Account security page. You were signed out everywhere.",
			"Reset password",
			"If this was you, there is nothing else to do. If it wasn’t, reset your password now and contact your operator."},
	},
	"hu": {
		codeSubject:  " a CaliRestore Pro kódod",
		greeting:     "Kedves {name}!",
		welcomeNamed: "Üdvözlünk a CaliRestore Pro-ban, {name}!",
		codeLabel:    "Ellenőrző kód",
		or:           "Vagy folytasd egy kattintással:",
		ignore:       "A kód és a hivatkozás 15 percig érvényes.",
		verify: [4]string{"Fejezd be a fiókod létrehozását",
			"Írd be ezt a kódot a Fiók létrehozása oldalon, és add meg a jelszavad.",
			"Jelszó megadása",
			"Ha nem te kérted, hagyd figyelmen kívül ezt a levelet. Jelszó nélkül nem jön létre fiók."},
		notRegistered: [4]string{"Még nincs fiókod",
			"Valaki jelszó-visszaállítást kért ehhez a címhez, de ezzel a címmel nincs CaliRestore Pro fiók. Ha te voltál, most létrehozhatod: írd be ezt a kódot azon az oldalon, ahol kérted.",
			"Fiók létrehozása",
			"Ha nem te kérted, hagyd figyelmen kívül ezt a levelet. Jelszó nélkül nem jön létre fiók."},
		reset: [4]string{"Állítsd vissza a jelszavad",
			"Írd be ezt a kódot a Nem tudsz bejelentkezni? oldalon, és adj meg új jelszót.",
			"Új jelszó megadása",
			"Az új jelszó mindenhol kijelentkeztet, és eltávolítja az azonosítókulcsaidat. Ha nem te kérted, hagyd figyelmen kívül ezt a levelet: a jelszavad nem változik."},
		exists: [4]string{"Már van fiókod",
			"Valaki CaliRestore Pro fiókot próbált létrehozni ezzel az e-mail-címmel, de neked már van fiókod. Jelentkezz be, vagy válaszd a „Nem tudsz bejelentkezni?” lehetőséget a jelszavad visszaállításához.",
			"Bejelentkezés",
			"Ha nem te voltál, hagyd figyelmen kívül ezt a levelet."},
		email: [4]string{"Erősítsd meg az új e-mail-címed",
			"Erősítsd meg ezt a címet, hogy ezzel jelentkezhess be a CaliRestore Pro-ba.",
			"E-mail-cím megerősítése",
			"A hivatkozás 30 percig érvényes. Ha nem te kérted a módosítást, hagyd figyelmen kívül ezt a levelet."},
		security: [4]string{"Változott a fiókod biztonsága",
			"Biztonsági módosítást kértek vagy hajtottak végre a CaliRestore Pro fiókodban.",
			"",
			"Ha nem te voltál, állítsd vissza a jelszavad, vagy fordulj az üzemeltetőhöz."},
		invite: [4]string{"Meghívtak egy projektbe",
			"CaliRestore Pro projektmeghívót kaptál. Jelentkezz be ezzel az e-mail-címmel a függő meghívók megtekintéséhez.",
			"Meghívók megtekintése",
			""},
		welcome: [4]string{"Üdvözlünk a CaliRestore Pro-ban",
			"Elkészült a fiókod, és már be is jelentkeztél. Legközelebb ezzel az e-mail-címmel és a választott jelszavaddal jelentkezz be. A Fiókbiztonság oldalon azonosítókulcsot is hozzáadhatsz, így ez az eszköz jelszó nélkül is bejelentkeztet.",
			"A CaliRestore Pro megnyitása",
			"Azért kaptad ezt a levelet, mert ezzel a címmel fiók jött létre. Ha nem te voltál, állítsd vissza a jelszót, és fordulj az üzemeltetőhöz."},
		passwordReset: [4]string{"Megváltozott a jelszavad",
			"A CaliRestore Pro fiókod jelszavát egy erre a címre küldött kóddal állították vissza. A többi eszközödön kijelentkeztettünk, és az azonosítókulcsaidat eltávolítottuk: a Fiókbiztonság oldalon újra hozzáadhatod őket.",
			"Jelszó visszaállítása",
			"Ha te voltál, nincs további teendőd. Ha nem, most állítsd vissza a jelszavad, és fordulj az üzemeltetőhöz."},
		passwordSet: [4]string{"Megváltozott a jelszavad",
			"A CaliRestore Pro fiókod jelszavát a Fiókbiztonság oldalon módosították. Minden eszközön kijelentkeztettünk.",
			"Jelszó visszaállítása",
			"Ha te voltál, nincs további teendőd. Ha nem, most állítsd vissza a jelszavad, és fordulj az üzemeltetőhöz."},
	},
}

// Compose turns a payload into the letter for its purpose and language.
func Compose(p Payload, origin string) Letter {
	w, ok := catalogue[p.Language]
	if !ok {
		w = catalogue["en"]
	}
	fill := func(text [4]string, subject, url string) Letter {
		return Letter{Subject: subject, Preheader: text[1], Heading: text[0], Paragraphs: []string{text[1]}, Action: text[2], URL: url, Note: text[3]}
	}
	link := func(route string) string {
		if p.Token == "" {
			return ""
		}
		return origin + route + "#token=" + p.Token
	}
	var letter Letter
	switch p.Purpose {
	case "verify", "not-registered", "reset":
		text, route := w.verify, "/verify-email"
		if p.Purpose == "not-registered" {
			text = w.notRegistered
		} else if p.Purpose == "reset" {
			text, route = w.reset, "/reset-password"
		}
		letter = fill(text, p.Code+w.codeSubject, link(route))
		if p.Code == "" {
			letter.Subject = text[0]
		}
		letter.CodeLabel, letter.Code = w.codeLabel, p.Code
		letter.ActionLead = w.or
		letter.Note = w.ignore + " " + text[3]
	case "account-exists":
		// The fragment fills in the address on the sign-in page and never reaches a server.
		signIn := origin + "/login"
		if p.To != "" {
			signIn += "#email=" + url.QueryEscape(p.To)
		}
		letter = fill(w.exists, w.exists[0], signIn)
	case "email":
		letter = fill(w.email, w.email[0], link("/confirm-email"))
	case "project-invitation":
		letter = fill(w.invite, w.invite[0], origin+"/invitations")
	case "welcome":
		letter = fill(w.welcome, w.welcome[0], origin+"/projects")
	case "password-reset":
		letter = fill(w.passwordReset, w.passwordReset[0], origin+"/forgot-password")
	case "password-changed":
		letter = fill(w.passwordSet, w.passwordSet[0], origin+"/forgot-password")
	default:
		letter = fill(w.security, w.security[0], "")
	}
	if letter.URL == "" {
		letter.Action = ""
	}
	// The welcome heading greets by name; every other email opens with a greeting.
	if p.Name != "" {
		if p.Purpose == "welcome" {
			letter.Heading = strings.ReplaceAll(w.welcomeNamed, "{name}", p.Name)
		} else {
			letter.Paragraphs = append([]string{strings.ReplaceAll(w.greeting, "{name}", p.Name)}, letter.Paragraphs...)
		}
	}
	// Notices keep the product name in the subject so they are recognisable in a list.
	if p.Code == "" {
		letter.Subject = "CaliRestore Pro: " + letter.Subject
	}
	return letter
}
