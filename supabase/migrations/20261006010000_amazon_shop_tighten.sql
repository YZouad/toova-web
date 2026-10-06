-- Backfill ASINs from resolved amzn.to short links, allow bundle analytics events,
-- and seed starter room bundles so multi-add cart is reachable.

-- 1) ASIN backfill (resolved from live amzn.to redirects on 2026-10-06)
UPDATE public.curated_products SET asin = v.asin
FROM (VALUES
  ('14b5f910-5790-4797-95c4-3b3d14b4815a', 'B004K6LHF2'),
  ('ee14ef92-c53d-4415-af11-ee9c4290d12a', 'B0BFCC18FS'),
  ('1c3c40e9-f7f5-42d3-883a-1f4428c9d329', 'B07GZ8HQZD'),
  ('34ca7118-e530-4e66-915c-a28e4812fc2b', 'B0GVSF8KFT'),
  ('dda1d582-b831-4baa-93fd-ededc66bf5f1', 'B074HCPCZT'),
  ('92953c53-2ea4-4e77-9eaf-2617806b4431', 'B074HCPCZT'),
  ('8a6e1dcc-bf2b-4ea4-abdb-74d4d4e94acd', 'B000KELL54'),
  ('dca8a7f4-9b3b-4274-af41-5dc18a56bbcf', 'B0BFPJ5VR3'),
  ('438201f7-6e6a-410a-a9b3-4d427a9dec48', 'B01FV0FBX4'),
  ('a0cfabc1-5262-49e1-85a2-fea3a6de1f8b', 'B0DGPP2T5Q'),
  ('883f9262-ebf2-4d70-8628-e8a9051f1043', 'B0FD4BG2P5'),
  ('78d3163f-8ef5-4a8c-a6da-6b69c0becb75', 'B0DJQGYHPF'),
  ('34f4f3f7-6ca8-470d-a216-a928addd2aa1', 'B0GGB3QL9D'),
  ('f9490140-c0ed-4824-ad56-27ccd11305db', 'B0BR8SX468'),
  ('ca8db040-a7c8-42d9-b739-b16fb82db2af', 'B07X4GWJCZ'),
  ('5a02b9af-a124-44f2-9029-e91b858eefc1', 'B001R1RXUG'),
  ('8dd1dfcc-51a9-452e-ac2e-b10ed47d5eec', 'B0BXW51QVX'),
  ('dbe7db3b-7c35-405f-9ba2-bdebe6ecbe42', 'B0FH14QF99'),
  ('0ceb847e-89a6-4bc4-968f-f9e7aaff708c', 'B01IRHUV6A'),
  ('048cfa11-3396-44ce-9a4b-dd1e7fcd5017', 'B0CGRDFT2X'),
  ('5cde1b2e-05c8-4bfa-a4c6-34d7dccde0d7', 'B09V366BDY'),
  ('67a3fe49-2586-4bfd-984b-cc116c637ced', 'B09X26745M'),
  ('51221ce7-3238-4df6-990c-6b0c489bede2', 'B0CSFRXCCH'),
  ('7a7843af-e7d8-4a74-b44c-ae55b6948d2b', 'B09PDLBFKY'),
  ('2333810d-3ccc-476f-943a-c8f727bd7c46', 'B0D9GFYJBV'),
  ('80fe7eac-29ca-4559-a475-a7a2c28d5702', 'B09SZ9T4MV'),
  ('942ad01a-19d4-4d82-a0c3-c828e5161a23', 'B0BL2FWX67'),
  ('edbc4f4e-6a3d-41ea-bc8d-cc5f3babc900', 'B0DRCM5YX6'),
  ('3e6bc316-91ca-4fd3-a3ab-edb47f5a6a64', 'B0CHDR2T32'),
  ('3dda35d1-c399-425f-9962-12616a6abd20', 'B09NF7RLYH'),
  ('861954fc-bca5-4841-b19e-7583123d0a8e', 'B0711RQMNF'),
  ('917d8c5f-b37c-47a9-ad65-fc7ecde5ec72', 'B07NYFP1Y3'),
  ('16c1a341-5152-45ea-8f39-651e69132bb3', 'B0DX6S1867'),
  ('f1621f72-fecd-450a-b560-2cc57164fcf6', 'B09R1V45Y6'),
  ('dc502250-a3b9-4023-b02c-e95a5da203c3', 'B07N1XLFXV'),
  ('9698e4f4-ac65-4023-8301-94bca41ed7bb', 'B07N1XLFXV'),
  ('4c431cd2-6d1e-45f2-81c9-85e79605aa4a', 'B071JM699B'),
  ('0b1d1cb3-e8ac-479b-9365-bc7311ca6250', 'B0DPYZ68GK'),
  ('bcdbef89-9512-4442-8a01-177a13f11abd', 'B0DLGGGYMN'),
  ('ca4f94e4-3082-407c-87be-f832a9ea37a6', 'B0DZNW28B7'),
  ('f38c6196-0a40-48ec-b592-7236e5c107f2', 'B0BYST53T6'),
  ('afc692aa-4c3a-4276-8045-aa96f612e29b', 'B0B3SR5M71'),
  ('c09702ef-0aa0-4726-87ec-859391175d73', 'B0DGPP2T5Q'),
  ('a2e7ff1a-4a0f-4e37-bca3-bf15d48caf90', 'B0F1L9HJWT'),
  ('54930338-1b65-4753-8148-b04922db666f', 'B0GCLBB5FJ'),
  ('c1ea9cf8-f559-4234-8b61-b0d859daa48d', 'B0CSFRXCCH'),
  ('0d29f37c-f5ad-4533-a320-c79c574c906f', 'B0H3ZTN1PF'),
  ('d3eb79e6-3a78-404f-acd2-500b3eca4f3f', 'B07C842GZM'),
  ('7339ad48-249d-4237-a5b3-566852ab8fc0', 'B0CNW5MX61'),
  ('46cc5a35-6935-4bfe-a88b-4a353402e2cd', 'B0GCD2M34V'),
  ('e53db859-0c8c-4b1a-8159-3f6894ef6cbc', 'B09F9B3BCY'),
  ('df004e61-74f1-4fd3-8d3b-6dc3cf6c6077', 'B0D495B5R4')
) AS v(id, asin)
WHERE curated_products.id = v.id::uuid
  AND curated_products.asin IS NULL;

-- 2) Allow bundle analytics events (previously rejected by name check)
ALTER TABLE public.analytics_events
  DROP CONSTRAINT IF EXISTS analytics_events_name_chk;

ALTER TABLE public.analytics_events
  ADD CONSTRAINT analytics_events_name_chk CHECK (
    name = ANY (ARRAY[
      'account_signed_up',
      'account_logged_in',
      'room_created',
      'design_item_added',
      'model_generation_started',
      'model_generation_succeeded',
      'model_generation_failed',
      'checklist_item_added',
      'product_affiliate_clicked',
      'room_shared',
      'room_liked',
      'catalog_searched',
      'plan_upgraded',
      'plan_cancelled',
      'limit_reached',
      'page_view',
      'session_started',
      'bundle_viewed',
      'bundle_added_to_room',
      'bundle_cart_clicked'
    ]::text[])
  );

-- 3) Starter published bundles (desk setup, bed basics, bathroom kit)
INSERT INTO public.bundles (id, slug, title, description, tags, published, sort_order)
VALUES
  (
    'a1000001-0000-4000-8000-000000000001',
    'desk-setup',
    'Desk setup',
    'Lamp, power, cushion, whiteboard, and charger — everything for a working desk in one Amazon cart.',
    ARRAY['desk', 'study'],
    true,
    10
  ),
  (
    'a1000001-0000-4000-8000-000000000002',
    'bed-basics',
    'Bed basics',
    'Sheets, comforter, and a bed pillow for lounging — open Amazon with the set ready to buy.',
    ARRAY['bed', 'sleep'],
    true,
    20
  ),
  (
    'a1000001-0000-4000-8000-000000000003',
    'bathroom-kit',
    'Bathroom kit',
    'Shower caddy, towel, soap, and shower shoes for shared bathrooms.',
    ARRAY['bathroom'],
    true,
    30
  )
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  tags = EXCLUDED.tags,
  published = EXCLUDED.published,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

INSERT INTO public.bundle_items (bundle_id, product_id, quantity, sort_order)
VALUES
  -- Desk setup
  ('a1000001-0000-4000-8000-000000000001', '34f4f3f7-6ca8-470d-a216-a928addd2aa1', 1, 10), -- desk lamp
  ('a1000001-0000-4000-8000-000000000001', '7a7843af-e7d8-4a74-b44c-ae55b6948d2b', 1, 20), -- power strip
  ('a1000001-0000-4000-8000-000000000001', 'dca8a7f4-9b3b-4274-af41-5dc18a56bbcf', 1, 30), -- chair cushion
  ('a1000001-0000-4000-8000-000000000001', '3e6bc316-91ca-4fd3-a3ab-edb47f5a6a64', 1, 40), -- small whiteboard
  ('a1000001-0000-4000-8000-000000000001', 'ee14ef92-c53d-4415-af11-ee9c4290d12a', 1, 50), -- 3-in-1 charger
  -- Bed basics
  ('a1000001-0000-4000-8000-000000000002', '92953c53-2ea4-4e77-9eaf-2617806b4431', 1, 10), -- bed sheets
  ('a1000001-0000-4000-8000-000000000002', 'dda1d582-b831-4baa-93fd-ededc66bf5f1', 1, 20), -- bed comforter
  ('a1000001-0000-4000-8000-000000000002', 'bcdbef89-9512-4442-8a01-177a13f11abd', 1, 30), -- work in bed pillow
  -- Bathroom kit
  ('a1000001-0000-4000-8000-000000000003', '80fe7eac-29ca-4559-a475-a7a2c28d5702', 1, 10), -- shower caddie
  ('a1000001-0000-4000-8000-000000000003', '917d8c5f-b37c-47a9-ad65-fc7ecde5ec72', 1, 20), -- towel
  ('a1000001-0000-4000-8000-000000000003', '3dda35d1-c399-425f-9962-12616a6abd20', 1, 30), -- soap
  ('a1000001-0000-4000-8000-000000000003', '942ad01a-19d4-4d82-a0c3-c828e5161a23', 1, 40)  -- shower shoes
ON CONFLICT (bundle_id, product_id) DO UPDATE SET
  quantity = EXCLUDED.quantity,
  sort_order = EXCLUDED.sort_order;
