-- Visibility is independent of project content access. Only organisation
-- members may see listed directory entries; existing project grants still gate
-- every content endpoint. Directory owners are read from project_owners/accounts.
ALTER TABLE hosted_projects
    ADD COLUMN visibility text NOT NULL DEFAULT 'private'
        CHECK (visibility IN ('private', 'listed')),
    ADD COLUMN visibility_version integer NOT NULL DEFAULT 1
        CHECK (visibility_version > 0),
    ADD COLUMN directory_name text NOT NULL DEFAULT ''
        CHECK (directory_name = btrim(directory_name) AND char_length(directory_name) <= 120),
    ADD CONSTRAINT listed_project_has_name CHECK (visibility <> 'listed' OR directory_name <> '');

-- Stable UUID keyset pagination, filtered by organisation and listed status.
-- The directory query must also exclude project_deletions and check membership.
CREATE INDEX hosted_projects_listed_directory
    ON hosted_projects(organisation_id, id) WHERE visibility = 'listed';

-- Slice B updates all three columns together with a visibility_version
-- compare-and-increment; a stale version returns 409 visibility_conflict.
GRANT UPDATE (visibility, visibility_version, directory_name) ON hosted_projects TO calirestore_app;
