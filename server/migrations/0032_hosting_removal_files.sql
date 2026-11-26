-- Files whose hosting was removed are deleted after the metadata transaction
-- commits. Retrying cleanup cannot damage a retained or newly hosted project.
CREATE TABLE hosting_removed_files (
    id uuid PRIMARY KEY,
    removed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
GRANT SELECT, INSERT, UPDATE (removed_at), DELETE ON hosting_removed_files TO calirestore_app;

-- Retain who may re-enable the same project ID after removing hosting.
CREATE TABLE hosting_removed_projects (
    id uuid PRIMARY KEY,
    host_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE
);
GRANT SELECT, INSERT, DELETE ON hosting_removed_projects TO calirestore_app;
