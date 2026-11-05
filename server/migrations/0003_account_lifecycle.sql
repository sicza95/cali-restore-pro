ALTER TABLE accounts ADD COLUMN language text NOT NULL DEFAULT 'en' CHECK (language IN ('en','hu'));
ALTER TABLE identity_audit DROP CONSTRAINT identity_audit_action_check;
ALTER TABLE identity_audit ADD CONSTRAINT identity_audit_action_check CHECK (action IN (
 'bootstrap','policy_changed','sessions_revoked','account_verified','password_changed','email_changed','email_change_requested'
));
CREATE TABLE identity_links (
    token_digest bytea PRIMARY KEY CHECK (octet_length(token_digest)=32),
    account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    purpose text NOT NULL CHECK (purpose IN ('verify','reset','email')),
    target_email text NOT NULL,
    expires_at timestamptz NOT NULL,
    UNIQUE(account_id,purpose)
);
-- Recoverable mail payloads are AES-GCM sealed with an operator-mounted key.
-- Successful/terminal jobs erase payloads; no bearer token is stored in clear.
CREATE TABLE mail_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payload bytea,
    attempts integer NOT NULL DEFAULT 0,
    available_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mail_pending ON mail_outbox(available_at) WHERE status='pending';
GRANT INSERT (email,password_hash,language) ON accounts TO calirestore_app;
GRANT UPDATE (email,password_hash,language) ON accounts TO calirestore_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON identity_links,mail_outbox TO calirestore_app;
