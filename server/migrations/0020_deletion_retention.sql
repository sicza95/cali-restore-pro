CREATE TABLE project_deletions (
    id uuid PRIMARY KEY,
    deleted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    recover_until timestamptz NOT NULL,
    purged_at timestamptz
);
CREATE TABLE account_deletions (
    id uuid PRIMARY KEY,
    deleted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    recover_until timestamptz NOT NULL,
    purged_at timestamptz
);
ALTER TABLE account_deletions ADD COLUMN previous_state text NOT NULL CHECK (previous_state IN ('active','suspended'));
GRANT SELECT, INSERT, UPDATE, DELETE ON project_deletions, account_deletions TO calirestore_app;

ALTER TABLE project_owners DROP CONSTRAINT project_owners_project_id_fkey,
    ADD FOREIGN KEY (project_id) REFERENCES hosted_projects(id) ON DELETE CASCADE;
ALTER TABLE encrypted_files DROP CONSTRAINT encrypted_files_project_id_fkey,
    ADD FOREIGN KEY (project_id) REFERENCES hosted_projects(id) ON DELETE CASCADE;
ALTER TABLE project_invitations DROP CONSTRAINT project_invitations_project_id_fkey,
    ADD FOREIGN KEY (project_id) REFERENCES hosted_projects(id) ON DELETE CASCADE,
    DROP CONSTRAINT project_invitations_recipient_id_fkey,
    ADD FOREIGN KEY (recipient_id) REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE invitation_grants DROP CONSTRAINT invitation_fixture_grants_invitation_id_fkey,
    ADD FOREIGN KEY (invitation_id) REFERENCES project_invitations(id) ON DELETE CASCADE;
ALTER TABLE retired_originals DROP CONSTRAINT retired_originals_file_id_fkey,
    ADD FOREIGN KEY (file_id) REFERENCES encrypted_files(id) ON DELETE CASCADE;
ALTER TABLE invitation_originals DROP CONSTRAINT invitation_originals_file_id_fkey,
    ADD FOREIGN KEY (file_id) REFERENCES encrypted_files(id) ON DELETE CASCADE;

-- Keep sender public keys only while surviving encrypted grants reference them.
-- The departing account cannot authenticate to use the detached identity.
ALTER TABLE sharing_identities DROP CONSTRAINT sharing_identities_account_id_fkey;
GRANT DELETE ON sharing_identities, hosted_projects, accounts TO calirestore_app;

-- Bootstrap is a historical fact. Keep its UUID and the last-superuser guard
-- even after the original bootstrap account is purged.
ALTER TABLE identity_guard DROP CONSTRAINT identity_guard_bootstrap_account_fkey;
ALTER TABLE mail_outbox ADD COLUMN account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
CREATE INDEX mail_outbox_account ON mail_outbox(account_id) WHERE account_id IS NOT NULL;

GRANT DELETE ON project_revision_key_transfers TO calirestore_app;

-- Operational archive keys are held by the current authority, separately from
-- archives, and are excluded when cloning authority into a restored service.
CREATE TABLE operational_archive_keys (
    id uuid PRIMARY KEY,
    key_hex text NOT NULL CHECK (key_hex ~ '^[0-9a-f]{64}$'),
    expires_at timestamptz NOT NULL
);
GRANT SELECT (id, expires_at), DELETE ON operational_archive_keys TO calirestore_app;
GRANT SELECT (active_superusers) ON identity_guard TO calirestore_app;
