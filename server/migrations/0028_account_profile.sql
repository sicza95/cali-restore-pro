-- A person's full name (used to greet them in every email) and an optional
-- profile photo. The photo is a small JPEG the browser has already cropped and
-- scaled; it lives in its own table so session lookups never read it.
ALTER TABLE accounts ADD COLUMN full_name text NOT NULL DEFAULT ''
    CHECK (full_name = btrim(full_name) AND char_length(full_name) <= 100);
CREATE TABLE account_photos (
    account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    image bytea NOT NULL CHECK (octet_length(image) BETWEEN 1 AND 262144),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
GRANT UPDATE (full_name) ON accounts TO calirestore_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON account_photos TO calirestore_app;
