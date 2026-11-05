CREATE TABLE hosting_transfers (
 project_id uuid PRIMARY KEY REFERENCES hosted_projects(id),
 id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 from_id uuid NOT NULL,
 to_id uuid NOT NULL,
 CHECK (from_id <> to_id),
 FOREIGN KEY (project_id, from_id) REFERENCES project_owners(project_id, account_id) ON DELETE CASCADE,
 FOREIGN KEY (project_id, to_id) REFERENCES project_owners(project_id, account_id) ON DELETE CASCADE
);
GRANT SELECT, INSERT, DELETE, UPDATE (id, from_id, to_id) ON hosting_transfers TO calirestore_app;
GRANT UPDATE (host_id) ON hosted_projects TO calirestore_app;
