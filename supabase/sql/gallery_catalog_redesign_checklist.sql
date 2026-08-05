-- Manual / CI SQL checks for gallery catalog redesign.
-- Run against a staging database after applying 20260805131853_gallery_catalog_redesign.sql

-- 1) Category limit
-- EXPECT: error too many categories
-- INSERT INTO furniture_catalog (kind, label, is_builtin, categories, visibility)
-- VALUES ('test-cats', 'Test', false, ARRAY['seating','beds','tables','rugs'], 'private');

-- 2) Banned words on label
-- EXPECT: Please remove inappropriate language.
-- INSERT INTO furniture_catalog (kind, label, is_builtin, categories, visibility, user_id)
-- VALUES ('test-ban', 'fuck chair', false, ARRAY['seating'], 'private', auth.uid());

-- 3) Authenticated public browse
-- As user A: insert public model with public profile
-- As user B: SELECT * FROM furniture_catalog WHERE kind = ... should return the row
-- As anon: same for visibility=public

-- 4) Owner update cannot change categories (trigger restores old categories)
-- UPDATE furniture_catalog SET categories = ARRAY['other'] WHERE kind = ... AND user_id = auth.uid();
-- SELECT categories FROM furniture_catalog WHERE kind = ...; -- unchanged

-- 5) set_catalog_visibility('public') fails when profiles.is_public is false

-- 6) delete_catalog_model only for owner; returns storage paths

SELECT 'gallery_catalog_redesign checklist loaded' AS status;
