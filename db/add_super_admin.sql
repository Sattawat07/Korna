-- Run once on an existing Korna database after this account has registered.
BEGIN;

ALTER TABLE users
    ALTER COLUMN role TYPE VARCHAR(20),
    DROP CONSTRAINT users_role_valid,
    ADD CONSTRAINT users_role_valid
        CHECK (role IN ('user', 'admin', 'super_admin'));

DO $$
BEGIN
    UPDATE users SET role = 'super_admin'
    WHERE user_email = 'korna.project2026@gmail.com';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'The Korna project account must register before promotion';
    END IF;
END $$;

COMMIT;
