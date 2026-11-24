-- Organisations (plan §8.5). Every account has a personal organisation of
-- one; a company is an organisation with several members. Projects belong to
-- an organisation, not to the person who created them.
CREATE TABLE organisations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- A personal organisation has no name of its own: the app calls it "Personal".
    name text NOT NULL CHECK (name = btrim(name) AND char_length(name) <= 100),
    personal_account uuid UNIQUE REFERENCES accounts(id) ON DELETE SET NULL,
    personal boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CHECK (personal = (name = '')),
    CHECK (personal OR personal_account IS NULL)
);

-- Admins see and can do everything in the organisation; members get what
-- their groups give them.
CREATE TABLE organisation_members (
    organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('admin','member')),
    joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (organisation_id, account_id)
);
CREATE INDEX organisation_members_account ON organisation_members(account_id);

-- A group is a named permission set (plan §8.4): none, read or write for each
-- section, plus a list of actions. "All projects" gives it on every project
-- of the organisation. The server checks the shape; the app owns the names.
CREATE TABLE organisation_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 60),
    sections jsonb NOT NULL CHECK (jsonb_typeof(sections) = 'object'),
    actions text[] NOT NULL DEFAULT '{}',
    all_projects boolean NOT NULL DEFAULT false,
    position integer NOT NULL DEFAULT 0,
    UNIQUE (organisation_id, id)
);
CREATE INDEX organisation_groups_organisation ON organisation_groups(organisation_id, position);

CREATE TABLE organisation_member_groups (
    organisation_id uuid NOT NULL,
    account_id uuid NOT NULL,
    group_id uuid NOT NULL,
    PRIMARY KEY (organisation_id, account_id, group_id),
    FOREIGN KEY (organisation_id, account_id) REFERENCES organisation_members(organisation_id, account_id) ON DELETE CASCADE,
    FOREIGN KEY (organisation_id, group_id) REFERENCES organisation_groups(organisation_id, id) ON DELETE CASCADE
);

-- An invitation names an email address, not an account, so inviting does not
-- tell the sender whether the address is registered. It shows up for the
-- account with that address, now or after it signs up.
CREATE TABLE organisation_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    email text NOT NULL CHECK (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254),
    role text NOT NULL CHECK (role IN ('admin','member')),
    groups uuid[] NOT NULL DEFAULT '{}',
    invited_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '14 days'),
    UNIQUE (organisation_id, email)
);
CREATE INDEX organisation_invitations_email ON organisation_invitations(email);

INSERT INTO organisations(name, personal_account, personal)
    SELECT '', id, true FROM accounts;
INSERT INTO organisation_members(organisation_id, account_id, role)
    SELECT id, personal_account, 'admin' FROM organisations WHERE personal;

-- Every new account gets its personal organisation in the same transaction.
CREATE FUNCTION create_personal_organisation() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE created uuid;
BEGIN
    INSERT INTO public.organisations(name, personal_account, personal) VALUES ('', NEW.id, true) RETURNING id INTO created;
    INSERT INTO public.organisation_members(organisation_id, account_id, role) VALUES (created, NEW.id, 'admin');
    RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION create_personal_organisation() FROM PUBLIC;
CREATE TRIGGER account_personal_organisation AFTER INSERT ON accounts
FOR EACH ROW EXECUTE FUNCTION create_personal_organisation();

-- A hosted project belongs to one organisation. Existing ones move into their
-- host's personal organisation, and so does a new one that names none.
ALTER TABLE hosted_projects ADD COLUMN organisation_id uuid REFERENCES organisations(id);
UPDATE hosted_projects h SET organisation_id = o.id
    FROM organisations o WHERE o.personal_account = h.host_id;
ALTER TABLE hosted_projects ALTER COLUMN organisation_id SET NOT NULL;
CREATE INDEX hosted_projects_organisation ON hosted_projects(organisation_id);

CREATE FUNCTION default_project_organisation() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    IF NEW.organisation_id IS NULL THEN
        SELECT id INTO NEW.organisation_id FROM public.organisations WHERE personal_account = NEW.host_id;
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION default_project_organisation() FROM PUBLIC;
CREATE TRIGGER hosted_project_organisation BEFORE INSERT ON hosted_projects
FOR EACH ROW EXECUTE FUNCTION default_project_organisation();

ALTER TABLE mail_outbox DROP CONSTRAINT mail_outbox_kind_check;
ALTER TABLE mail_outbox ADD CONSTRAINT mail_outbox_kind_check
    CHECK (kind IN ('','verify','reset','email','security','project-invitation','welcome','organisation-invitation'));

GRANT SELECT, INSERT, UPDATE (name), DELETE ON organisations TO calirestore_app;
GRANT SELECT, INSERT, UPDATE (role), DELETE ON organisation_members TO calirestore_app;
GRANT SELECT, INSERT, UPDATE (name, sections, actions, all_projects, position), DELETE ON organisation_groups TO calirestore_app;
GRANT SELECT, INSERT, DELETE ON organisation_member_groups TO calirestore_app;
GRANT SELECT, INSERT, UPDATE (role, groups, invited_by, created_at, expires_at), DELETE ON organisation_invitations TO calirestore_app;
GRANT UPDATE (organisation_id) ON hosted_projects TO calirestore_app;
