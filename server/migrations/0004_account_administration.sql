ALTER TABLE accounts ADD COLUMN admin_permissions integer NOT NULL DEFAULT 0 CHECK (admin_permissions BETWEEN 0 AND 7);
UPDATE accounts SET admin_permissions=1 WHERE role='administrator';
ALTER TABLE accounts ADD COLUMN server_features boolean NOT NULL DEFAULT false;
ALTER TABLE accounts ADD COLUMN quota_mib integer NOT NULL DEFAULT 0 CHECK (quota_mib BETWEEN 0 AND 1048576);
ALTER TABLE accounts ADD CONSTRAINT admin_permissions_role CHECK (role='administrator' OR admin_permissions=0);
CREATE INDEX accounts_email_search ON accounts(email text_pattern_ops);
ALTER TABLE identity_audit DROP CONSTRAINT identity_audit_action_check;
ALTER TABLE identity_audit ADD CONSTRAINT identity_audit_action_check CHECK (action IN (
 'bootstrap','policy_changed','sessions_revoked','account_verified','password_changed','email_changed','email_change_requested',
 'entitlements_changed','delegation_changed'
));
GRANT UPDATE (admin_permissions,server_features,quota_mib) ON accounts TO calirestore_app;
GRANT SELECT ON identity_audit TO calirestore_app;
CREATE INDEX mail_outbox_recent ON mail_outbox(created_at DESC,id DESC);
