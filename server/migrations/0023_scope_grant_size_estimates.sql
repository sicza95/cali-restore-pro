-- A device now keeps an estimate with its snapshots in 768 KiB (#91), so a full
-- estimate scope may hold 768 KiB of plaintext: 786448 ciphertext bytes, 1048600
-- base64 characters. Matches scopeGrantMaxBytes in the server.
ALTER TABLE invitation_scope_grants
 DROP CONSTRAINT invitation_scope_grants_ciphertext_check,
 ADD CONSTRAINT invitation_scope_grants_ciphertext_check
  CHECK (length(ciphertext) BETWEEN 24 AND 1048600);
