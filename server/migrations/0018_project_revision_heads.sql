ALTER TABLE hosted_projects
 ADD COLUMN sync_epoch uuid NOT NULL DEFAULT gen_random_uuid();
GRANT UPDATE (sync_epoch) ON hosted_projects TO calirestore_app;

CREATE TABLE project_revision_heads (
 project_id uuid PRIMARY KEY REFERENCES hosted_projects(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK (revision > 0),
 epoch uuid NOT NULL,
 salt bytea NOT NULL CHECK (octet_length(salt) = 32),
 ciphertext bytea NOT NULL CHECK (octet_length(ciphertext) BETWEEN 16 AND 65552)
);
GRANT SELECT, INSERT, UPDATE ON project_revision_heads TO calirestore_app;
