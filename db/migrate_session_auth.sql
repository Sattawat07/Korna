-- Run once on an existing demo database after confirming there are no users.
-- Existing plaintext passwords cannot be preserved in this SQL-only migration.
BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM users) THEN
        RAISE EXCEPTION 'users contains data; migrate passwords to Argon2id before changing the schema';
    END IF;
END
$$;

ALTER TABLE users RENAME COLUMN user_password TO password_hash;
ALTER TABLE users ADD COLUMN password_salt TEXT NOT NULL;
ALTER TABLE users ADD COLUMN role VARCHAR(10) NOT NULL DEFAULT 'user';
ALTER TABLE users ADD CONSTRAINT users_role_valid CHECK (role IN ('user', 'admin'));

CREATE TABLE sessions (
    sid VARCHAR NOT NULL PRIMARY KEY,
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX sessions_expire_idx ON sessions (expire);

COMMIT;
