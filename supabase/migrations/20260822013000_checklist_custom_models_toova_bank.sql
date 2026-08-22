-- Promote checklist-linked generated models (GLB already on the row) into the
-- Toova bank and file them under matching gallery categories.

UPDATE public.furniture_catalog AS fc
SET
  is_builtin = true,
  visibility = 'public',
  categories = v.categories
FROM (
  VALUES
    ('custom-02f04c51-341b-44de-a21d-75fea10170bb', ARRAY['appliances', 'kitchen']::text[]),
    ('custom-a9ba5bb3-0823-4602-bbea-0d46003f7321', ARRAY['appliances', 'kitchen']::text[]),
    ('custom-fff23e14-b208-49b9-80e5-0c520df7976d', ARRAY['appliances', 'kitchen']::text[]),
    ('custom-5ebf26ea-3377-4915-a51b-f4ffa7b4d261', ARRAY['appliances', 'kitchen']::text[]),
    ('custom-a899f146-fd9b-4b28-8206-c7fe029575bb', ARRAY['kitchen']::text[]),
    ('custom-de1467cc-3768-4ef5-bd42-06fa7ad6aab1', ARRAY['kitchen']::text[]),
    ('custom-ff4f0d39-dadc-4edb-8ee3-3e79931216df', ARRAY['appliances']::text[]),
    ('custom-077f40e2-5cae-4092-aa9f-90356f60d792', ARRAY['bathroom']::text[]),
    ('custom-14886253-e6ec-4391-acea-e16168ec4f02', ARRAY['bathroom']::text[]),
    ('custom-8df0edfe-6df7-4bc5-969e-ebe23ece09fe', ARRAY['bathroom']::text[]),
    ('custom-fb5463d1-5342-4b5b-9901-c25b0e3fa626', ARRAY['bathroom']::text[]),
    ('custom-860cae28-61df-4465-a29e-1a4b67900810', ARRAY['bathroom']::text[]),
    ('custom-b2cc0083-4871-4e53-83d2-3707b272d0e4', ARRAY['electronics']::text[]),
    ('custom-c7b751d6-e84e-49f3-b9e9-8010e10a989a', ARRAY['electronics']::text[]),
    ('custom-947b5264-541a-4920-8da1-644a9906468b', ARRAY['electronics', 'decor_art']::text[]),
    ('custom-e3595c92-d82f-4b73-b24c-bfbc2e8c4938', ARRAY['electronics', 'decor_art']::text[]),
    ('custom-e1044642-6ab8-44bd-bed9-2b24ffa0f19f', ARRAY['seating']::text[]),
    ('custom-301e5ecc-5088-410c-a67f-4b2ddf0f47b1', ARRAY['seating']::text[]),
    ('custom-b3e82c83-e133-4b68-924e-ee948af325a1', ARRAY['storage']::text[]),
    ('custom-8b3a400e-8e56-4164-85cb-101e8877407a', ARRAY['storage']::text[]),
    ('custom-2eafc893-f4b4-4820-984c-3b2b7bc39542', ARRAY['beds']::text[]),
    ('custom-7b30b614-241d-4dcc-9579-3b2bd23d5e2b', ARRAY['other']::text[])
) AS v(kind, categories)
WHERE fc.kind = v.kind
  AND fc.model_url IS NOT NULL
  AND btrim(fc.model_url) <> '';
