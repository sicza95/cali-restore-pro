-- A passkey can also confirm the signed-in person before a security change.
-- Like registration, that ceremony is bound to the session it confirms.
ALTER TABLE passkey_ceremonies DROP CONSTRAINT passkey_ceremonies_purpose_check;
ALTER TABLE passkey_ceremonies DROP CONSTRAINT passkey_ceremonies_check;
ALTER TABLE passkey_ceremonies ADD CONSTRAINT passkey_ceremonies_purpose_check
    CHECK (purpose IN ('register','login','confirm'));
ALTER TABLE passkey_ceremonies ADD CONSTRAINT passkey_ceremonies_session_check
    CHECK ((purpose IN ('register','confirm')) = (session_id IS NOT NULL));
