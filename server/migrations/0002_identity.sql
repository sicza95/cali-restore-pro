-- Authentication metadata only; credentials never unlock project content.
CREATE TABLE accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) <= 254),
    password_hash text NOT NULL,
    state text NOT NULL DEFAULT 'pending_verification' CHECK (state IN ('pending_verification','active','suspended','pending_deletion')),
    role text NOT NULL DEFAULT 'member' CHECK (role IN ('member','administrator','superuser')),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE identity_guard (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    bootstrap_account uuid REFERENCES accounts(id),
    active_superusers integer NOT NULL DEFAULT 0 CHECK (active_superusers >= 0),
    CHECK (bootstrap_account IS NULL OR active_superusers > 0)
);
INSERT INTO identity_guard (singleton) VALUES (true);

-- Updating one counter row serializes even concurrent direct SQL changes. A
-- check constraint prevents the final active superuser leaving after bootstrap.
CREATE FUNCTION protect_superusers() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE delta integer := 0;
BEGIN
    IF TG_OP <> 'INSERT' AND OLD.role = 'superuser' AND OLD.state = 'active' THEN delta := delta - 1; END IF;
    IF TG_OP <> 'DELETE' AND NEW.role = 'superuser' AND NEW.state = 'active' THEN delta := delta + 1; END IF;
    IF delta <> 0 THEN UPDATE public.identity_guard SET active_superusers = active_superusers + delta WHERE singleton; END IF;
    RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION protect_superusers() FROM PUBLIC;
CREATE TRIGGER account_superuser_guard AFTER INSERT OR UPDATE OR DELETE ON accounts
FOR EACH ROW EXECUTE FUNCTION protect_superusers();

CREATE TABLE sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    token_digest bytea NOT NULL UNIQUE CHECK (octet_length(token_digest) = 32),
    created_at timestamptz NOT NULL DEFAULT now(),
    verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_account ON sessions(account_id);
CREATE TABLE auth_rate_limits (
    bucket bytea NOT NULL CHECK (octet_length(bucket) = 32),
    window_at timestamptz NOT NULL,
    attempts integer NOT NULL CHECK (attempts > 0),
    PRIMARY KEY (bucket, window_at)
);
CREATE TABLE identity_audit (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    action text NOT NULL CHECK (action IN ('bootstrap','policy_changed','sessions_revoked')),
    created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON accounts TO calirestore_app;
GRANT UPDATE (role, state) ON accounts TO calirestore_app;
GRANT SELECT, INSERT, DELETE ON sessions TO calirestore_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_rate_limits TO calirestore_app;
GRANT INSERT ON identity_audit TO calirestore_app;
GRANT USAGE ON SEQUENCE identity_audit_id_seq TO calirestore_app;
