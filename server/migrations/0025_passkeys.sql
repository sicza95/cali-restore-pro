-- Optional passkeys are a sign-in factor only (ADR 0009). Nothing here unlocks
-- project content; the vault keeps its own secret. Public keys are not secrets.
ALTER TABLE accounts ADD COLUMN passkey_handle bytea UNIQUE
    CHECK (passkey_handle IS NULL OR octet_length(passkey_handle) = 32);
CREATE TABLE passkeys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    credential_id bytea NOT NULL UNIQUE CHECK (octet_length(credential_id) BETWEEN 1 AND 1023),
    public_key bytea NOT NULL CHECK (octet_length(public_key) BETWEEN 1 AND 2048),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 64),
    sign_count bigint NOT NULL DEFAULT 0 CHECK (sign_count BETWEEN 0 AND 4294967295),
    flags smallint NOT NULL CHECK (flags BETWEEN 0 AND 255),
    backup_eligible boolean NOT NULL,
    backup_state boolean NOT NULL,
    clone_warning boolean NOT NULL DEFAULT false,
    aaguid bytea CHECK (aaguid IS NULL OR octet_length(aaguid) = 16),
    attestation_type text NOT NULL DEFAULT '' CHECK (length(attestation_type) <= 32),
    attestation_format text NOT NULL DEFAULT '' CHECK (length(attestation_format) <= 32),
    transports text[] NOT NULL DEFAULT '{}' CHECK (cardinality(transports) <= 8),
    attachment text NOT NULL DEFAULT '' CHECK (length(attachment) <= 32),
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz,
    CHECK (backup_eligible OR NOT backup_state)
);
CREATE INDEX passkeys_account ON passkeys(account_id);

-- Single-use challenges. Registration is bound to the confirming session, so
-- revoking that session also ends the ceremony; sign-in has no session yet.
CREATE TABLE passkey_ceremonies (
    token_digest bytea PRIMARY KEY CHECK (octet_length(token_digest) = 32),
    purpose text NOT NULL CHECK (purpose IN ('register','login')),
    session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
    data jsonb NOT NULL CHECK (octet_length(data::text) <= 8192),
    expires_at timestamptz NOT NULL,
    CHECK ((purpose = 'register') = (session_id IS NOT NULL))
);
CREATE INDEX passkey_ceremonies_expiry ON passkey_ceremonies(expires_at);

ALTER TABLE identity_audit DROP CONSTRAINT identity_audit_action_check;
ALTER TABLE identity_audit ADD CONSTRAINT identity_audit_action_check CHECK (action IN (
 'bootstrap','policy_changed','sessions_revoked','account_verified','password_changed','email_changed','email_change_requested',
 'entitlements_changed','delegation_changed','passkey_added','passkey_removed'
));
GRANT UPDATE (passkey_handle) ON accounts TO calirestore_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON passkeys TO calirestore_app;
GRANT SELECT, INSERT, DELETE ON passkey_ceremonies TO calirestore_app;
