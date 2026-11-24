package mailer

import (
	"bytes"
	"html/template"
	"strings"
)

// Text renders the plain-text part: the same words as the HTML part, with the
// button written out as a link.
func Text(p Payload, origin string) (string, string) {
	l := Compose(p, origin)
	parts := append([]string{l.Heading}, l.Paragraphs...)
	if l.Code != "" {
		parts = append(parts, l.CodeLabel+": "+l.Code)
	}
	if l.Action != "" {
		lead := ""
		if l.ActionLead != "" {
			lead = l.ActionLead + "\n"
		}
		parts = append(parts, lead+l.Action+": "+l.URL)
	}
	if l.Note != "" {
		parts = append(parts, l.Note)
	}
	return l.Subject, strings.Join(parts, "\n\n")
}

// HTML renders the HTML part. Tables and inline styles keep the layout in
// mail clients that ignore modern CSS; the style block adds dark mode where
// it is supported. Every value is escaped by html/template.
func HTML(p Payload, origin string) string {
	var out bytes.Buffer
	l := Compose(p, origin)
	lang := "en"
	if p.Language == "hu" {
		lang = "hu"
	}
	// Spaced digits read and copy more easily; the template keeps them one string.
	spaced := strings.Join(strings.Split(l.Code, ""), " ")
	_ = page.Execute(&out, map[string]any{"L": l, "Lang": lang, "Code": spaced})
	return out.String()
}

var page = template.Must(template.New("mail").Parse(`<!doctype html>
<html lang="{{.Lang}}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>{{.L.Subject}}</title>
<style>
  body { margin: 0; padding: 0; }
  a { color: #006b7a; }
  @media (prefers-color-scheme: dark) {
    .cr-ground { background: #171a1c !important; }
    .cr-card { background: #212527 !important; border-color: #32393d !important; }
    .cr-ink { color: #f3f5f5 !important; }
    .cr-muted { color: #adb7bc !important; }
    .cr-code { background: #171a1c !important; border-color: #32393d !important; color: #f3f5f5 !important; }
    .cr-button { background: #72d9e4 !important; }
    .cr-button a { color: #112629 !important; }
    .cr-mark { background: #72d9e4 !important; color: #112629 !important; }
    .cr-note { border-color: #32393d !important; }
    a { color: #72d9e4; }
  }
  @media (max-width: 520px) {
    .cr-card-pad { padding: 28px 22px !important; }
  }
</style>
</head>
<body class="cr-ground" style="margin:0;padding:0;background:#eef1f1;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{{.L.Preheader}}</div>
<table role="presentation" class="cr-ground" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1f1;">
<tr><td align="center" style="padding:40px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
  <tr><td style="padding:0 4px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td class="cr-mark" width="30" height="30" align="center" style="width:30px;height:30px;background:#006b7a;border-radius:8px;color:#ffffff;font-size:13px;line-height:30px;font-weight:800;letter-spacing:-0.02em;">CR</td>
      <td class="cr-ink" style="padding-left:10px;font-size:17px;color:#202a2e;letter-spacing:-0.01em;">CaliRestore <strong>Pro</strong></td>
    </tr></table>
  </td></tr>
  <tr><td class="cr-card cr-card-pad" style="background:#ffffff;border:1px solid #e0e6e8;border-radius:16px;padding:36px 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <h1 class="cr-ink" style="margin:0 0 16px;font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;color:#202a2e;">{{.L.Heading}}</h1>
    {{range .L.Paragraphs}}<p class="cr-ink" style="margin:0 0 24px;font-size:16px;line-height:1.55;color:#202a2e;">{{.}}</p>{{end}}
    {{if .L.Code}}
    <p class="cr-muted" style="margin:0 0 8px;font-size:13px;line-height:1.4;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#5a686e;">{{.L.CodeLabel}}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;"><tr>
      <td class="cr-code" align="center" style="background:#eef1f1;border:1px solid #e0e6e8;border-radius:12px;padding:18px 12px;font-family:'SF Mono',Menlo,Consolas,'Liberation Mono',monospace;font-size:34px;line-height:1;font-weight:700;letter-spacing:0.06em;color:#202a2e;">{{.Code}}</td>
    </tr></table>
    {{end}}
    {{if .L.Action}}
    {{if .L.ActionLead}}<p class="cr-muted" style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#5a686e;">{{.L.ActionLead}}</p>{{end}}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;"><tr>
      <td class="cr-button" style="background:#006b7a;border-radius:10px;">
        <a href="{{.L.URL}}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:10px;">{{.L.Action}}</a>
      </td>
    </tr></table>
    {{end}}
    {{if .L.Note}}<p class="cr-muted cr-note" style="margin:0;padding-top:20px;border-top:1px solid #e0e6e8;font-size:14px;line-height:1.55;color:#5a686e;">{{.L.Note}}</p>{{end}}
  </td></tr>
  {{if .L.Action}}
  <tr><td class="cr-muted" style="padding:20px 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#5a686e;word-break:break-all;">
    <a href="{{.L.URL}}" style="color:#5a686e;">{{.L.URL}}</a>
  </td></tr>
  {{end}}
  </table>
</td></tr>
</table>
</body>
</html>
`))
