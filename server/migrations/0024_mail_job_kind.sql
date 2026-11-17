-- Keep only the mail kind after payload erasure. Existing jobs have no recoverable
-- kind once sent, so leave them unknown rather than decrypting or guessing.
ALTER TABLE mail_outbox ADD COLUMN kind text NOT NULL DEFAULT ''
    CHECK (kind IN ('','verify','reset','email','security','project-invitation'));
