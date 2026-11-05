CREATE TABLE project_revision_key_transfers (
 project_id uuid NOT NULL REFERENCES hosted_projects(id) ON DELETE CASCADE,
 recipient_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 sender_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 id uuid NOT NULL,
 epoch uuid NOT NULL,
 sync_epoch uuid NOT NULL,
 expires_at timestamptz NOT NULL,
 salt bytea NOT NULL CHECK (octet_length(salt) = 32),
 ciphertext bytea NOT NULL CHECK (octet_length(ciphertext) = 82),
 PRIMARY KEY (project_id, recipient_id)
);
GRANT SELECT, INSERT, UPDATE ON project_revision_key_transfers TO calirestore_app;
