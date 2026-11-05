ALTER TABLE hosted_projects RENAME COLUMN owner_id TO host_id;
ALTER INDEX hosted_projects_owner RENAME TO hosted_projects_host;

CREATE TABLE project_owners (
 project_id uuid NOT NULL REFERENCES hosted_projects(id),
 account_id uuid NOT NULL REFERENCES accounts(id),
 PRIMARY KEY (project_id, account_id)
);
CREATE INDEX project_owners_account ON project_owners(account_id);

INSERT INTO project_owners(project_id, account_id)
 SELECT id, host_id FROM hosted_projects;

-- Hosting can move only to a project owner. Deferral allows the project and
-- its first owner to be created in the same transaction.
ALTER TABLE hosted_projects ADD CONSTRAINT hosted_project_host_is_owner
 FOREIGN KEY (id, host_id) REFERENCES project_owners(project_id, account_id)
 DEFERRABLE INITIALLY DEFERRED;

GRANT SELECT, INSERT ON project_owners TO calirestore_app;
