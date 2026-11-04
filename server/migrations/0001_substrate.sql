-- Operational metadata only. No users, project content or mock business records.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO calirestore_app;
GRANT SELECT ON schema_migrations TO calirestore_app;
