-- Run while connected to the "korna" database.
-- Run only for a fresh database, then run seed_categories.sql.
BEGIN;

CREATE TABLE users (
    user_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_name VARCHAR(100) NOT NULL,
    user_email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    user_room_number VARCHAR(20) NOT NULL,
    user_phone_number VARCHAR(20),
    user_avatar_url TEXT,
    user_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT users_name_not_blank CHECK (LENGTH(TRIM(user_name)) > 0),
    CONSTRAINT users_room_not_blank CHECK (LENGTH(TRIM(user_room_number)) > 0),
    CONSTRAINT users_role_valid CHECK (role IN ('user', 'admin', 'super_admin'))
);

-- connect-pg-simple stores session data here; only the signed session ID is in the cookie.
CREATE TABLE sessions (
    sid VARCHAR NOT NULL PRIMARY KEY,
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX sessions_expire_idx ON sessions (expire);

CREATE TABLE categories (
    category_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE,
    CONSTRAINT categories_name_not_blank CHECK (LENGTH(TRIM(category_name)) > 0)
);

CREATE TABLE items (
    item_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_owner_id BIGINT NOT NULL REFERENCES users(user_id),
    item_category_id BIGINT NOT NULL REFERENCES categories(category_id),
    item_title VARCHAR(200) NOT NULL,
    item_description TEXT,
    item_type VARCHAR(10) NOT NULL,
    item_defects TEXT,
    -- The API sets pending when the first request arrives, and completed on approval.
    item_status VARCHAR(10) NOT NULL DEFAULT 'available',
    item_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT items_title_not_blank CHECK (LENGTH(TRIM(item_title)) > 0),
    CONSTRAINT items_type_valid CHECK (item_type IN ('free', 'swap')),
    CONSTRAINT items_status_valid CHECK (item_status IN ('available', 'pending', 'completed', 'removed'))
);

CREATE TABLE item_images (
    image_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    image_item_id BIGINT NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    position INTEGER NOT NULL,
    CONSTRAINT item_images_url_not_blank CHECK (LENGTH(TRIM(image_url)) > 0),
    CONSTRAINT item_images_position_nonnegative CHECK (position >= 0),
    CONSTRAINT item_images_item_position_unique UNIQUE (image_item_id, position)
);

CREATE TABLE item_swap_details (
    swap_detail_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    swap_item_id BIGINT NOT NULL UNIQUE REFERENCES items(item_id) ON DELETE CASCADE,
    desired_category_id BIGINT REFERENCES categories(category_id),
    desired_description TEXT
);

CREATE TABLE requests (
    request_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_item_id BIGINT NOT NULL REFERENCES items(item_id),
    requester_user_id BIGINT NOT NULL REFERENCES users(user_id),
    request_message TEXT,
    request_status VARCHAR(10) NOT NULL DEFAULT 'pending',
    request_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT requests_status_valid CHECK (request_status IN ('pending', 'accepted', 'rejected')),
    CONSTRAINT requests_one_per_user_per_item UNIQUE (request_item_id, requester_user_id)
);

CREATE TABLE request_swap_offers (
    offer_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    offer_request_id BIGINT NOT NULL UNIQUE REFERENCES requests(request_id) ON DELETE CASCADE,
    offer_description TEXT NOT NULL,
    CONSTRAINT offers_description_not_blank CHECK (LENGTH(TRIM(offer_description)) > 0)
);

CREATE TABLE request_swap_offer_images (
    image_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    image_offer_id BIGINT NOT NULL REFERENCES request_swap_offers(offer_id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    position INTEGER NOT NULL,
    CONSTRAINT offer_images_url_not_blank CHECK (LENGTH(TRIM(image_url)) > 0),
    CONSTRAINT offer_images_position_nonnegative CHECK (position >= 0),
    CONSTRAINT offer_images_offer_position_unique UNIQUE (image_offer_id, position)
);

CREATE TABLE notifications (
    notification_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recipient_user_id BIGINT NOT NULL REFERENCES users(user_id),
    actor_user_id BIGINT NOT NULL REFERENCES users(user_id),
    notification_item_id BIGINT NOT NULL REFERENCES items(item_id),
    notification_request_id BIGINT NOT NULL REFERENCES requests(request_id),
    notification_type VARCHAR(20) NOT NULL,
    notification_decision VARCHAR(10),
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT notifications_type_decision_valid CHECK (
        (notification_type = 'request_received' AND notification_decision IS NULL) OR
        (notification_type = 'request_decided' AND notification_decision IS NOT NULL AND notification_decision IN ('accepted', 'rejected'))
    )
);

-- A post can have only one accepted request, even if two approvals race.
CREATE UNIQUE INDEX requests_one_accepted_per_item
    ON requests (request_item_id)
    WHERE request_status = 'accepted';

-- Indexes for the feed, filters, profiles, and request lists.
CREATE INDEX items_feed_idx ON items (item_status, item_created_at DESC);
CREATE INDEX items_category_idx ON items (item_category_id);
CREATE INDEX items_owner_idx ON items (item_owner_id);
CREATE INDEX requests_item_status_idx ON requests (request_item_id, request_status);
CREATE INDEX requests_requester_idx ON requests (requester_user_id);
CREATE INDEX notifications_recipient_created_idx
    ON notifications (recipient_user_id, created_at DESC, notification_id DESC);
CREATE INDEX notifications_unread_idx
    ON notifications (recipient_user_id) WHERE read_at IS NULL;

COMMIT;
