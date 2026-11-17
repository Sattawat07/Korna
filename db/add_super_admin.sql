-- Run once on an existing Korna database after this account has registered.
BEGIN;

ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(20);
ALTER TABLE users DROP CONSTRAINT users_role_valid;
ALTER TABLE users ADD CONSTRAINT users_role_valid
    CHECK (role IN ('user', 'admin', 'super_admin'));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM users WHERE user_email = 'korna.project2026@gmail.com'
    ) THEN
        RAISE EXCEPTION 'The Korna project account must register before promotion';
    END IF;

    UPDATE users SET role = 'super_admin'
    WHERE user_email = 'korna.project2026@gmail.com';
END $$;

COMMIT;
