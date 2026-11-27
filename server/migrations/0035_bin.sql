-- Bin: recoverable deletion events for hosted projects, objects and surfaces.
-- A whole-project entry is associated with project_deletions, which stays the access and
-- recovery gate for the project; there is no second whole-project deletion truth.
CREATE TABLE bin_entries (
    deletion_id uuid PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES hosted_projects(id) ON DELETE CASCADE,
    entity_kind text NOT NULL CHECK (entity_kind IN ('project', 'object', 'surface')),
    entity_id uuid NOT NULL,
    object_id uuid,
    state text NOT NULL DEFAULT 'retained' CHECK (state IN ('retained', 'restored', 'purged')),
    purge_reason text CHECK (purge_reason IN ('requested', 'expired', 'project_purged')),
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    deleted_at timestamptz NOT NULL,
    deleted_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
    recover_until timestamptz NOT NULL,
    manifest_schema integer NOT NULL CHECK (manifest_schema >= 1),
    manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
    coverage_missing text[] NOT NULL DEFAULT '{}',
    coverage_legacy boolean NOT NULL DEFAULT false,
    source_revision integer NOT NULL CHECK (source_revision >= 0),
    operation_id uuid NOT NULL,
    logical_bytes bigint NOT NULL CHECK (logical_bytes >= 0),
    chunk_count integer NOT NULL CHECK (chunk_count BETWEEN 1 AND 64),
    -- Name, path and recovery manifest are sealed by the client like any other document.
    display_salt bytea NOT NULL CHECK (length(display_salt) = 32),
    display_ciphertext bytea NOT NULL CHECK (length(display_ciphertext) BETWEEN 16 AND 65552),
    manifest_salt bytea NOT NULL CHECK (length(manifest_salt) = 32),
    manifest_ciphertext bytea NOT NULL CHECK (length(manifest_ciphertext) BETWEEN 16 AND 1048600),
    CHECK ((entity_kind = 'surface') = (object_id IS NOT NULL)),
    CHECK ((state = 'purged') = (purge_reason IS NOT NULL))
);
CREATE INDEX bin_entries_project ON bin_entries(project_id, state);
CREATE INDEX bin_entries_catalog ON bin_entries(deleted_at DESC, deletion_id DESC) WHERE state = 'retained';
CREATE INDEX bin_entries_deadline ON bin_entries(recover_until) WHERE state = 'retained';

-- Recovery chunks: staged first (bounded, hashed, leased), committed with the lifecycle command.
CREATE TABLE bin_chunks (
    deletion_id uuid NOT NULL,
    idx integer NOT NULL CHECK (idx BETWEEN 0 AND 63),
    project_id uuid NOT NULL REFERENCES hosted_projects(id) ON DELETE CASCADE,
    sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    body bytea NOT NULL CHECK (length(body) BETWEEN 1 AND 1048576),
    staged_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
    staged_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    committed boolean NOT NULL DEFAULT false,
    PRIMARY KEY (deletion_id, idx)
);
CREATE INDEX bin_chunks_staged ON bin_chunks(staged_at) WHERE NOT committed;
CREATE INDEX bin_chunks_project ON bin_chunks(project_id);

-- Files a retained entry needs; physical collection checks these before deleting a file.
CREATE TABLE bin_pins (
    asset_id uuid NOT NULL,
    deletion_id uuid NOT NULL REFERENCES bin_entries(deletion_id) ON DELETE CASCADE,
    PRIMARY KEY (asset_id, deletion_id)
);
CREATE INDEX bin_pins_deletion ON bin_pins(deletion_id);

-- Idempotency: one digest per operation ID. Outcomes may be compacted; the digest stays.
CREATE TABLE bin_receipts (
    operation_id uuid PRIMARY KEY,
    project_id uuid NOT NULL,
    digest text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
    outcome jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Terminal identity fences for the project's lifetime; no foreign key so a purge keeps them.
CREATE TABLE bin_fences (
    project_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    deletion_id uuid NOT NULL,
    state text NOT NULL CHECK (state IN ('restored', 'purged')),
    version bigint NOT NULL,
    digest text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (project_id, entity_id, deletion_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON bin_entries, bin_chunks, bin_pins, bin_receipts, bin_fences TO calirestore_app;
