-- Run while connected to the "korna" database.
-- This script creates the six tables for the demo; it does not delete existing data.
BEGIN;

CREATE TABLE users (
    user_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_name VARCHAR(100) NOT NULL,
    user_email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    user_room_number VARCHAR(20) NOT NULL,
    user_phone_number VARCHAR(20),
    user_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT users_name_not_blank CHECK (LENGTH(TRIM(user_name)) > 0),
    CONSTRAINT users_room_not_blank CHECK (LENGTH(TRIM(user_room_number)) > 0)
);

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
    item_image_url TEXT,
    -- The API sets pending when the first request arrives, and completed on approval.
    item_status VARCHAR(10) NOT NULL DEFAULT 'available',
    item_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT items_title_not_blank CHECK (LENGTH(TRIM(item_title)) > 0),
    CONSTRAINT items_type_valid CHECK (item_type IN ('free', 'swap')),
    CONSTRAINT items_status_valid CHECK (item_status IN ('available', 'pending', 'completed', 'removed'))
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
    offer_image_url TEXT,
    CONSTRAINT offers_description_not_blank CHECK (LENGTH(TRIM(offer_description)) > 0)
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

COMMIT;
