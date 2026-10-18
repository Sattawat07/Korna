-- Run after db/schema.sql while connected to the "korna" database.
-- Safe to run again: existing category names are kept as they are.
BEGIN;

INSERT INTO categories (category_name)
VALUES
    ('Books & Documents'),
    ('Study Supplies'),
    ('Clothing & Accessories'),
    ('Electronics'),
    ('Room Essentials'),
    ('Furniture'),
    ('Sports & Hobbies'),
    ('Other')
ON CONFLICT (category_name) DO NOTHING;

COMMIT;

-- Check the categories after seeding.
SELECT category_id, category_name
FROM categories
ORDER BY category_id;
