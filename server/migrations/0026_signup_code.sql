-- Create account by email only: the verification link also carries a six-digit
-- code. Only a digest is kept; wrong entries are counted and end the code.
ALTER TABLE identity_links ADD COLUMN code_digest bytea CHECK (code_digest IS NULL OR octet_length(code_digest)=32);
ALTER TABLE identity_links ADD COLUMN code_attempts integer NOT NULL DEFAULT 0 CHECK (code_attempts >= 0);
