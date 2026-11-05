CREATE TABLE sharing_identities (
 account_id uuid PRIMARY KEY REFERENCES accounts(id),
 public_key text NOT NULL CHECK (length(public_key)=88)
);
ALTER TABLE project_invitations DROP CONSTRAINT project_invitations_state_check;
ALTER TABLE project_invitations ADD CHECK (state IN ('pending','accepted','cancelled','active'));
CREATE TABLE invitation_fixture_grants (
 invitation_id uuid PRIMARY KEY REFERENCES project_invitations(id),
 sender_id uuid NOT NULL REFERENCES sharing_identities(account_id),
 encapsulation text NOT NULL CHECK (length(encapsulation)=88),
 ciphertext text NOT NULL CHECK (length(ciphertext) BETWEEN 24 AND 512)
);
GRANT SELECT, INSERT ON sharing_identities, invitation_fixture_grants TO calirestore_app;
