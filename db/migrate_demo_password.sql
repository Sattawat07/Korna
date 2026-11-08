-- Run once in an existing korna database that was created with password_hash.
-- This migration only runs when users is empty. Existing hashes cannot be
-- converted back into passwords; preserve existing accounts separately.
BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM users) THEN
        RAISE EXCEPTION 'users is not empty; do not convert existing password hashes to demo passwords';
    END IF;
END
$$;

ALTER TABLE users RENAME COLUMN password_hash TO user_password;

COMMIT;
