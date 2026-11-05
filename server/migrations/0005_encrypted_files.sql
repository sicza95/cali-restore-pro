CREATE TABLE hosted_projects (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES accounts(id)
);
CREATE TABLE encrypted_files (
 id uuid PRIMARY KEY,
 project_id uuid NOT NULL REFERENCES hosted_projects(id),
 source_bytes bigint NOT NULL CHECK (source_bytes BETWEEN 1 AND 268435456),
 manifest_bytes integer NOT NULL CHECK (manifest_bytes BETWEEN 17 AND 16384),
 charged_bytes bigint GENERATED ALWAYS AS (
   source_bytes + ((source_bytes + 1048575) / 1048576) * 16 + manifest_bytes
 ) STORED,
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
 state text NOT NULL DEFAULT 'staged' CHECK (state IN ('staged','committed','cancelled'))
);
CREATE INDEX hosted_projects_owner ON hosted_projects(owner_id);
CREATE INDEX encrypted_files_project ON encrypted_files(project_id);
CREATE INDEX encrypted_files_cleanup ON encrypted_files(expires_at) WHERE state <> 'committed';
CREATE TABLE encrypted_parts (
 file_id uuid NOT NULL REFERENCES encrypted_files(id) ON DELETE CASCADE,
 part integer NOT NULL CHECK (part BETWEEN 0 AND 256),
 digest bytea NOT NULL CHECK (octet_length(digest)=32),
 PRIMARY KEY (file_id,part)
);
GRANT SELECT, INSERT ON hosted_projects TO calirestore_app;
GRANT SELECT, INSERT, DELETE, UPDATE (state,expires_at) ON encrypted_files TO calirestore_app;
GRANT SELECT, INSERT ON encrypted_parts TO calirestore_app;
-- Row locks serialize transfers with session revocation.
GRANT UPDATE (created_at) ON sessions TO calirestore_app;
