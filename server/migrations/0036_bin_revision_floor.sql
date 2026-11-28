-- A graph read before a Bin head change may not be republished by ordinary sync.
ALTER TABLE hosted_projects
    ADD COLUMN bin_revision_floor integer NOT NULL DEFAULT 0 CHECK (bin_revision_floor >= 0);
GRANT UPDATE (bin_revision_floor) ON hosted_projects TO calirestore_app;

-- Protect lifecycle changes accepted before this migration, including purged entries.
UPDATE hosted_projects p
SET bin_revision_floor = previous.revision
FROM (
    SELECT project_id, max((outcome #>> '{head,revision}')::integer) AS revision
    FROM bin_receipts
    WHERE outcome #>> '{head,revision}' IS NOT NULL
    GROUP BY project_id
) previous
WHERE p.id = previous.project_id;
