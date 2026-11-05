CREATE TABLE invitation_checkpoint_grants (
 invitation_id uuid NOT NULL REFERENCES invitation_grants(invitation_id) ON DELETE CASCADE,
 checkpoint_id uuid NOT NULL,
 sender_id uuid NOT NULL REFERENCES sharing_identities(account_id),
 encapsulation text NOT NULL CHECK (length(encapsulation)=88),
 ciphertext text NOT NULL CHECK (length(ciphertext) BETWEEN 24 AND 2048),
 PRIMARY KEY (invitation_id,checkpoint_id)
);

GRANT SELECT, INSERT, DELETE ON invitation_checkpoint_grants TO calirestore_app;
