CREATE TABLE project_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES hosted_projects(id),
 recipient_id uuid NOT NULL REFERENCES accounts(id),
 recipient_email text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','accepted','cancelled')),
 UNIQUE (project_id, recipient_id)
);
CREATE INDEX project_invitations_recipient ON project_invitations(recipient_id);
GRANT SELECT, INSERT, UPDATE (id, recipient_email, expires_at, state) ON project_invitations TO calirestore_app;
