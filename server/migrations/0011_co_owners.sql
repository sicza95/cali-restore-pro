ALTER TABLE project_invitations ADD COLUMN co_owner boolean NOT NULL DEFAULT false;
GRANT UPDATE (co_owner) ON project_invitations TO calirestore_app;
GRANT DELETE ON project_owners TO calirestore_app;
