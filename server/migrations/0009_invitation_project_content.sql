ALTER TABLE invitation_fixture_grants RENAME TO invitation_grants;
ALTER TABLE invitation_grants
 ADD COLUMN format text NOT NULL DEFAULT 'fixture-v1',
 DROP CONSTRAINT invitation_fixture_grants_ciphertext_check,
 ADD CHECK (
  (format='fixture-v1' AND length(ciphertext) BETWEEN 24 AND 512) OR
  (format='project-v1' AND length(ciphertext) BETWEEN 24 AND 87404)
 );
