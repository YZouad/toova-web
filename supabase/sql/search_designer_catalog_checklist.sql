-- Manual / CI checks for search_designer_catalog.
-- Run after applying 20260831010000_search_designer_catalog.sql

-- EXPECT: extension present
SELECT extname FROM pg_extension WHERE extname = 'pg_trgm';

-- EXPECT: function exists
SELECT proname FROM pg_proc WHERE proname = 'search_designer_catalog';

-- EXPECT: lamp-ish query returns builtin lamp when seeded
SELECT kind, source, relevance
FROM public.search_designer_catalog('lamp', ARRAY['lamp','light','lighting'], 12, true)
WHERE kind = 'lamp' OR lower(label) LIKE '%lamp%'
LIMIT 5;

-- EXPECT: empty / blank query returns zero rows
SELECT count(*) AS blank_count
FROM public.search_designer_catalog('   ', NULL, 12, true);

SELECT 'search_designer_catalog checklist loaded' AS status;
