-- Shared restoration/report defaults, including the account's Personal organisation.
-- NULL distinguishes an untouched organisation from explicitly saved defaults.
ALTER TABLE organisations ADD COLUMN defaults jsonb
    CHECK (defaults IS NULL OR jsonb_typeof(defaults) = 'object');
GRANT UPDATE (defaults) ON organisations TO calirestore_app;

-- Personal organisation shells may outlive their purged account. Do not retain
-- its report contact details or logo after the FK clears personal_account.
CREATE FUNCTION clear_personal_organisation_defaults() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.personal_account IS NOT NULL AND NEW.personal_account IS NULL THEN
        NEW.defaults = NULL;
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION clear_personal_organisation_defaults() FROM PUBLIC;
CREATE TRIGGER clear_personal_organisation_defaults
BEFORE UPDATE OF personal_account ON organisations
FOR EACH ROW EXECUTE FUNCTION clear_personal_organisation_defaults();
