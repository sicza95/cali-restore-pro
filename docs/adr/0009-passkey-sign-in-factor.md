# 0009 · Passkeys are an optional sign-in factor only

Status: Accepted · Date: 2026-11-17 · Decided by: owner · Source: issue #121 (split from #56), [access and encryption plan](../plan/access-and-encryption.md)

## Context

PRIV-03 asks for optional passkey sign-in and, separately, an evaluation of passkey-based content unlock. Content keys live in the client vault ([ADR 0002](0002-client-side-encryption.md)); the server has no master decryptor, and the recovery routes (trusted device, recovery key) must not depend on passkeys. WebAuthn PRF support differs across iPad Safari, desktop browsers and password managers, and has not been qualified.

## Decision

A passkey signs an account in and does nothing else. The vault still unlocks with its existing secret; no WebAuthn PRF or other extension is requested, and an assertion is never treated as decryption authorization. Password sign-in, reset and recovery keep working unchanged.

- Registration and removal happen on the account security page after a recent (five-minute) password confirmation, like every other credential change. Each adds a security event (`passkey_added`, `passkey_removed`) and queues the account security notice.
- Sign-in uses a discoverable credential with user verification required; no email is typed. A passkey session starts without a recent confirmation, so security changes still ask for the password.
- The server verifies every ceremony with [go-webauthn/webauthn](https://github.com/go-webauthn/webauthn) v0.18.2. Challenges are single-use, expire after five minutes and are consumed before verification; registration challenges are bound to the confirming session. Attestation is `none`; credentials store the public key, signature counter, backup flags and transports. A counter that goes backwards refuses the sign-in and flags the passkey for the owner.
- The relying party ID is the `APP_ORIGIN` host. Browsers refuse IP-address relying parties, so an origin such as `http://127.0.0.1:8080` offers password sign-in only and the client hides the passkey button.

## Consequences

- Passkeys add a sign-in route without changing the threat model for content: losing every passkey loses nothing but convenience, and a stolen passkey still cannot open a vault.
- Password reset by email does not remove passkeys. Owners remove unknown passkeys themselves; the security notice on every change is the signal.
- Changing `APP_ORIGIN`'s host invalidates existing passkeys (their relying party ID no longer matches). Operators must keep the host stable or tell users to add passkeys again.
- Browser coverage is a Chromium virtual authenticator (`tests-platform/passkeys.spec.ts`) and Go tests with a software authenticator. Physical iPad Safari, iCloud Keychain and third-party password managers remain a compatibility gate before PRIV-03 is accepted (M-16).
- Any later passkey unlock needs a new ADR, reviewed key provisioning, and must keep the trusted-device and recovery-key routes.

## Alternatives considered

- PRF-based vault unlock now: rejected by the owner (2026-11-17); support is uneven and it would need reviewed key provisioning.
- Passkey as a second factor beside the password: not requested; it would change every existing sign-in.
- Hand-written WebAuthn verification: rejected; CBOR, COSE and attestation parsing belong in a maintained library.
- Treating a passkey sign-in as a recent confirmation: rejected to keep credential changes behind the password.
