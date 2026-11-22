begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select ok(
  public.is_canonical_storage_key('11111111-1111-4111-8111-111111111111/room/file.jpg'),
  'owner-shaped key is canonical'
);

select ok(
  not public.is_canonical_storage_key('11111111-1111-4111-8111-111111111111/../../model-files/secret.glb'),
  'dot segments are not a storage key'
);

select ok(
  not public.is_canonical_storage_key('https://evil.example/a.jpg'),
  'absolute URLs are not storage keys'
);

select ok(
  public.is_static_asset_path('checklist-refs/glb/desk.glb'),
  'bundled checklist models stay addressable'
);

select ok(
  not public.is_static_asset_path('checklist-refs/../secret.glb'),
  'static paths cannot climb'
);

select is(
  public.owned_storage_key(
    '22222222-2222-4222-8222-222222222222/a.jpg',
    '11111111-1111-4111-8111-111111111111'::uuid
  ),
  null,
  'a key owned by someone else is dropped'
);

select is(
  has_function_privilege('anon', 'public.is_canonical_storage_key(text)', 'EXECUTE'),
  false,
  'anon cannot call the path helper'
);

select is(
  has_function_privilege('authenticated', 'public.room_asset_path_allowed(text, uuid)', 'EXECUTE'),
  false,
  'authenticated cannot probe path allowance'
);

select * from finish();
rollback;
