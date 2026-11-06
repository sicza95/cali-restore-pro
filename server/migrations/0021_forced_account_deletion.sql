ALTER TABLE hosted_projects ALTER COLUMN host_id DROP NOT NULL;

-- Only freezes created by forced deletion are lifted on account recovery.
ALTER TABLE project_deletions ADD COLUMN forced_account_id uuid;
CREATE INDEX project_deletions_forced_account ON project_deletions(forced_account_id)
 WHERE forced_account_id IS NOT NULL;
