/** Textured vertical poster plane GLB (Y-up, inches). Mirrors createPosterGlb layout. */

function flipUvY(uvs) {
  for (let i = 1; i < uvs.length; i += 2) {
    uvs[i] = 1 - uvs[i];
  }
}

function mimeForImage(imageBytes) {
  if (imageBytes[0] === 0xff && imageBytes[1] === 0xd8) return 'image/jpeg';
  if (
    imageBytes[0] === 0x89 &&
    imageBytes[1] === 0x50 &&
    imageBytes[2] === 0x4e &&
    imageBytes[3] === 0x47
  ) {
    return 'image/png';
  }
  return 'image/jpeg';
}

/**
 * @param {Uint8Array} imageBytes JPEG or PNG texture bytes
 * @param {number} widthIn poster width (inches)
 * @param {number} heightIn poster height (inches)
 */
export function buildPosterGlb(imageBytes, widthIn, heightIn) {
  const hx = widthIn / 2;
  const hy = heightIn / 2;
  const positions = [
    -hx, -hy, 0,
    hx, -hy, 0,
    hx, hy, 0,
    -hx, hy, 0,
  ];
  const normals = [
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ];
  const uvs = [0, 0, 1, 0, 1, 1, 0, 1];
  flipUvY(uvs);
  const indices = [0, 1, 2, 0, 2, 3];

  const posBytes = new Uint8Array(new Float32Array(positions).buffer);
  const nrmBytes = new Uint8Array(new Float32Array(normals).buffer);
  const uvBytes = new Uint8Array(new Float32Array(uvs).buffer);
  const idxBytes = new Uint8Array(new Uint16Array(indices).buffer);
  const img = imageBytes instanceof Uint8Array ? imageBytes : new Uint8Array(imageBytes);
  const mime = mimeForImage(img);

  const jsonViews = [
    { buffer: 0, byteOffset: 0, byteLength: posBytes.length, target: 34962 },
    { buffer: 0, byteOffset: posBytes.length, byteLength: nrmBytes.length, target: 34962 },
    { buffer: 0, byteOffset: posBytes.length + nrmBytes.length, byteLength: uvBytes.length, target: 34962 },
    {
      buffer: 0,
      byteOffset: posBytes.length + nrmBytes.length + uvBytes.length,
      byteLength: idxBytes.length,
      target: 34963,
    },
    { buffer: 0, byteOffset: posBytes.length + nrmBytes.length + uvBytes.length + idxBytes.length, byteLength: img.length },
  ];

  const bin = new Uint8Array(jsonViews[4].byteOffset + img.length);
  bin.set(posBytes, 0);
  bin.set(nrmBytes, posBytes.length);
  bin.set(uvBytes, posBytes.length + nrmBytes.length);
  bin.set(idxBytes, posBytes.length + nrmBytes.length + uvBytes.length);
  bin.set(img, jsonViews[4].byteOffset);

  const json = JSON.stringify({
    asset: { version: '2.0', generator: 'toova-poster' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
            indices: 3,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        name: 'poster',
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicFactor: 0,
          roughnessFactor: 0.85,
        },
        doubleSided: true,
      },
    ],
    textures: [{ source: 0 }],
    images: [{ mimeType: mime, bufferView: 4 }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 4,
        type: 'VEC3',
        min: [-hx, -hy, 0],
        max: [hx, hy, 0],
      },
      { bufferView: 1, componentType: 5126, count: 4, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: 4, type: 'VEC2' },
      { bufferView: 3, componentType: 5123, count: 6, type: 'SCALAR' },
    ],
    bufferViews: jsonViews,
    buffers: [{ byteLength: bin.length }],
  });

  const jsonPad = (4 - (json.length % 4)) % 4;
  const jsonChunk = Buffer.concat([Buffer.from(json, 'utf8'), Buffer.alloc(jsonPad, 0x20)]);
  const binPad = (4 - (bin.length % 4)) % 4;
  const binChunk = Buffer.concat([Buffer.from(bin), Buffer.alloc(binPad)]);

  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonChunk.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(out, 20);
  const binHeader = 20 + jsonChunk.length;
  out.writeUInt32LE(binChunk.length, binHeader);
  out.writeUInt32LE(0x004e4942, binHeader + 4);
  binChunk.copy(out, binHeader + 8);
  return out;
}
