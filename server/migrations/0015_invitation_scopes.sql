ALTER TABLE project_invitations
 ADD COLUMN estimate_scope text NOT NULL DEFAULT 'none'
 CHECK (estimate_scope IN ('none','estimate-summary','estimate-full')),
 ADD COLUMN share_history boolean NOT NULL DEFAULT false;
GRANT UPDATE (estimate_scope,share_history) ON project_invitations TO calirestore_app;

CREATE TABLE invitation_scope_grants (
 invitation_id uuid NOT NULL REFERENCES invitation_grants(invitation_id) ON DELETE CASCADE,
 scope text NOT NULL CHECK (scope IN ('estimate-summary','estimate-full','history')),
 encapsulation text NOT NULL CHECK (length(encapsulation)=88),
 ciphertext text NOT NULL CHECK (length(ciphertext) BETWEEN 24 AND 2048),
 PRIMARY KEY (invitation_id,scope)
);
GRANT SELECT, INSERT ON invitation_scope_grants TO calirestore_app;
