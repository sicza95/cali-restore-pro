ALTER TABLE project_invitations
 DROP CONSTRAINT project_invitations_state_check,
 ADD CHECK (state IN ('pending','accepted','cancelled','active','revoked'));
GRANT DELETE ON invitation_grants TO calirestore_app;
