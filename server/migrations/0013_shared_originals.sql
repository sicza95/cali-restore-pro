CREATE TABLE invitation_originals (
 invitation_id uuid NOT NULL REFERENCES invitation_grants(invitation_id) ON DELETE CASCADE,
 file_id uuid NOT NULL REFERENCES encrypted_files(id),
 PRIMARY KEY (invitation_id,file_id)
);
GRANT SELECT, INSERT ON invitation_originals TO calirestore_app;
