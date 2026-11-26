-- Record the source group name at invitation time. This is display provenance,
-- not a live ACL or an additional grant. Older invitations remain unclassified.
ALTER TABLE project_invitations ADD COLUMN group_name text NOT NULL DEFAULT '' CHECK (char_length(group_name)<=60);
GRANT UPDATE (group_name) ON project_invitations TO calirestore_app;
