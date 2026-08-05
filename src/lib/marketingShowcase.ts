/** Hard-coded marketing showcase assets (public room + public catalog model). */
export const MARKETING_SHOWCASE = {
  room: {
    handle: 'yzouad',
    roomId: 'f6482f75-90b6-4028-a7db-4b0246da0174',
    label: 'Woodlawn Room',
  },
  object: {
    /** Public furniture_catalog.kind */
    kind: 'custom-c6ebc96e-11a9-4b9b-b15f-618b280afe66',
    modelPath: '791d872b-6a53-459c-8019-3c0319a05fe0/ecd1a3e9-fb18-4541-a505-8e5e317768b3.glb',
    label: 'Arm Chair',
    sizeIn: [24, 24, 24] as [number, number, number],
  },
} as const;
