ALTER TABLE hosted_projects ADD COLUMN original_epoch uuid;
GRANT UPDATE (original_epoch) ON hosted_projects TO calirestore_app;

ALTER TABLE invitation_originals ADD COLUMN source_id uuid;
UPDATE invitation_originals SET source_id=file_id;
ALTER TABLE invitation_originals ALTER COLUMN source_id SET NOT NULL;
ALTER TABLE invitation_originals ADD UNIQUE (invitation_id,source_id);
GRANT DELETE ON invitation_originals TO calirestore_app;
GRANT UPDATE (encapsulation,ciphertext) ON invitation_grants TO calirestore_app;

CREATE TABLE retired_originals (
 file_id uuid PRIMARY KEY REFERENCES encrypted_files(id)
);
GRANT SELECT, INSERT ON retired_originals TO calirestore_app;
