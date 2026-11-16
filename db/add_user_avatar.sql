-- Run once on an existing Korna database before deploying the avatar API.
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_avatar_url TEXT;
