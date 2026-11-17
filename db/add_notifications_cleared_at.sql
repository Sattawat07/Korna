-- Run once on an existing Korna database before deploying Clear notifications.
BEGIN;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ;

DROP INDEX IF EXISTS notifications_recipient_created_idx;
CREATE INDEX notifications_recipient_created_idx
    ON notifications (recipient_user_id, created_at DESC, notification_id DESC)
    WHERE cleared_at IS NULL;

DROP INDEX IF EXISTS notifications_unread_idx;
CREATE INDEX notifications_unread_idx
    ON notifications (recipient_user_id) WHERE read_at IS NULL AND cleared_at IS NULL;

COMMIT;
