ALTER TABLE invitation_scope_grants ADD COLUMN sender_id uuid REFERENCES sharing_identities(account_id);
UPDATE invitation_scope_grants s SET sender_id=g.sender_id
 FROM invitation_grants g WHERE g.invitation_id=s.invitation_id;
ALTER TABLE invitation_scope_grants ALTER COLUMN sender_id SET NOT NULL;
GRANT DELETE ON invitation_scope_grants TO calirestore_app;
