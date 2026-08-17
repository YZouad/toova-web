/**
 * Landing-page showcase assets.
 *
 * GLBs live in `public/marketing/` so GitHub Pages serves them with stable,
 * cacheable URLs. The landing page must not sign these from Supabase Storage —
 * that was the 11 GB egress leak (13 MB of private-bucket GLBs per view).
 *
 * To refresh a snapshot: download the storage object into public/marketing/
 * and update the map below. The live /u/yzouad/r/… page still uses Storage.
 */
export const MARKETING_SHOWCASE = {
  room: {
    handle: 'yzouad',
    roomId: 'f6482f75-90b6-4028-a7db-4b0246da0174',
    label: 'Woodlawn Room',
  },
  object: {
    /** Public furniture_catalog.kind */
    kind: 'custom-c6ebc96e-11a9-4b9b-b15f-618b280afe66',
    /** Repo-static copy (public/marketing/armchair.glb). */
    modelPath: 'marketing/armchair.glb',
    label: 'Arm Chair',
    sizeIn: [24, 24, 24] as [number, number, number],
  },
  /**
   * Storage object keys in the Woodlawn room → static copies under public/.
   * loadPublicRoomLayout uses these instead of createSignedUrl.
   */
  roomAssetMap: {
    '791d872b-6a53-459c-8019-3c0319a05fe0/662774a4-0e88-48af-98bb-0f5f9dbc2234.glb':
      'marketing/woodlawn-662774a4.glb',
    '791d872b-6a53-459c-8019-3c0319a05fe0/948BB304-7B01-4D45-AE79-C5848B94F7AF.glb':
      'marketing/woodlawn-948bb304.glb',
    '791d872b-6a53-459c-8019-3c0319a05fe0/D8747605-7909-4D11-BFFB-ED36BF81C2F5.glb':
      'marketing/woodlawn-d8747605.glb',
  },
} as const;
