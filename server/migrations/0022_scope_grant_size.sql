-- A full estimate scope carries the whole issued snapshot (#88). Like the project
-- snapshot (0009), it may hold 64 KiB of plaintext: 65552 ciphertext bytes, 87404
-- base64 characters. Matches scopeGrantMaxBytes in the server.
ALTER TABLE invitation_scope_grants
 DROP CONSTRAINT invitation_scope_grants_ciphertext_check,
 ADD CONSTRAINT invitation_scope_grants_ciphertext_check
  CHECK (length(ciphertext) BETWEEN 24 AND 87404);
