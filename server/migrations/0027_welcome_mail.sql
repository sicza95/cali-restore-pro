-- A finished sign-up sends a welcome email; admin lists it under its own kind.
ALTER TABLE mail_outbox DROP CONSTRAINT mail_outbox_kind_check;
ALTER TABLE mail_outbox ADD CONSTRAINT mail_outbox_kind_check
    CHECK (kind IN ('','verify','reset','email','security','project-invitation','welcome'));
