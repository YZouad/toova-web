/** Minimal box / framed-panel GLBs (Y-up, size in inches). */

function appendBox(target, w, h, d, origin = [0, 0, 0]) {
  const [ox, oy, oz] = origin;
  const hx = w / 2;
  const hy = h / 2;
  const hz = d / 2;
  const faces = [
    { n: [0, 0, 1], v: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
    { n: [0, 0, -1], v: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
    { n: [0, 1, 0], v: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
    { n: [0, -1, 0], v: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
    { n: [1, 0, 0], v: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
    { n: [-1, 0, 0], v: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
  ];
  const indexStart = target.indices.length;
  for (const face of faces) {
    const faceBase = target.positions.length / 3;
    for (const [x, y, z] of face.v) {
      const px = x + ox;
      const py = y + oy;
      const pz = z + oz;
      target.positions.push(px, py, pz);
      target.normals.push(...face.n);
      target.min = [
        Math.min(target.min[0], px),
        Math.min(target.min[1], py),
        Math.min(target.min[2], pz),
      ];
      target.max = [
        Math.max(target.max[0], px),
        Math.max(target.max[1], py),
        Math.max(target.max[2], pz),
      ];
    }
    target.indices.push(faceBase, faceBase + 1, faceBase + 2, faceBase, faceBase + 2, faceBase + 3);
  }
  return { indexStart, indexCount: 36 };
}

function packGlb(target, materials, primitiveSpecs) {
  const posBytes = new Uint8Array(new Float32Array(target.positions).buffer);
  const nrmBytes = new Uint8Array(new Float32Array(target.normals).buffer);
  const idxBytes = new Uint8Array(new Uint16Array(target.indices).buffer);
  const bin = new Uint8Array(posBytes.length + nrmBytes.length + idxBytes.length);
  bin.set(posBytes, 0);
  bin.set(nrmBytes, posBytes.length);
  bin.set(idxBytes, posBytes.length + nrmBytes.length);

  const accessors = [
    {
      bufferView: 0,
      componentType: 5126,
      count: target.positions.length / 3,
      type: 'VEC3',
      min: target.min,
      max: target.max,
    },
    {
      bufferView: 1,
      componentType: 5126,
      count: target.normals.length / 3,
      type: 'VEC3',
    },
  ];
  const primitives = primitiveSpecs.map((spec) => {
    const accessorIndex = accessors.length;
    accessors.push({
      bufferView: 2,
      byteOffset: spec.indexStart * 2,
      componentType: 5123,
      count: spec.indexCount,
      type: 'SCALAR',
    });
    return {
      attributes: { POSITION: 0, NORMAL: 1 },
      indices: accessorIndex,
      material: spec.material,
    };
  });

  const json = JSON.stringify({
    asset: { version: '2.0', generator: 'toova-box' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives }],
    materials,
    accessors,
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.length, target: 34962 },
      { buffer: 0, byteOffset: posBytes.length, byteLength: nrmBytes.length, target: 34962 },
      {
        buffer: 0,
        byteOffset: posBytes.length + nrmBytes.length,
        byteLength: idxBytes.length,
        target: 34963,
      },
    ],
    buffers: [{ byteLength: bin.length }],
  });

  const jsonPad = (4 - (json.length % 4)) % 4;
  const jsonChunk = Buffer.concat([
    Buffer.from(json, 'utf8'),
    Buffer.alloc(jsonPad, 0x20),
  ]);
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

function emptyTarget() {
  return {
    positions: [],
    normals: [],
    indices: [],
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
}

function materialJson(name, color, roughness, metallic) {
  return {
    name,
    pbrMetallicRoughness: {
      baseColorFactor: color,
      metallicFactor: metallic,
      roughnessFactor: roughness,
    },
    doubleSided: true,
  };
}

/** Single solid box GLB (Y-up, size in inches). */
export function buildBoxGlb(w, h, d, opts = {}) {
  const {
    name = 'box',
    color = [0.97, 0.97, 0.97, 1],
    roughness = 0.32,
    metallic = 0,
  } = opts;
  const target = emptyTarget();
  appendBox(target, w, h, d);
  return packGlb(
    target,
    [materialJson(name, color, roughness, metallic)],
    [{ indexStart: 0, indexCount: 36, material: 0 }],
  );
}

/**
 * Upright panel with a dark rim and inset face (mirror / framed board).
 * `rimIn` is the visible frame width on each side.
 */
export function buildFramedPanelGlb(w, h, d, opts = {}) {
  const {
    rimIn = 0.75,
    frameColor = [0.06, 0.06, 0.06, 1],
    paneColor = [0.72, 0.86, 0.94, 1],
    frameRoughness = 0.42,
    paneRoughness = 0.08,
    paneMetallic = 0.22,
  } = opts;
  const inset = Math.min(rimIn, w / 2 - 0.1, h / 2 - 0.1);
  const paneW = w - inset * 2;
  const paneH = h - inset * 2;
  const paneD = Math.max(0.04, d * 0.12);
  const paneZ = d / 2 - paneD / 2 + 0.01;

  const target = emptyTarget();
  const frame = appendBox(target, w, h, d);
  const pane = appendBox(target, paneW, paneH, paneD, [0, 0, paneZ]);

  return packGlb(
    target,
    [
      materialJson('frame', frameColor, frameRoughness, 0.05),
      materialJson('pane', paneColor, paneRoughness, paneMetallic),
    ],
    [
      { indexStart: frame.indexStart, indexCount: frame.indexCount, material: 0 },
      { indexStart: pane.indexStart, indexCount: pane.indexCount, material: 1 },
    ],
  );
}

/** White board with a grey marker tray as a bottom band (same depth as the board). */
export function buildWhiteboardGlb(w, h, d, opts = {}) {
  const {
    trayHeight = 2.25,
    trayColor = [0.38, 0.39, 0.41, 1],
  } = opts;
  const paneH = h - trayHeight;
  const target = emptyTarget();
  const board = appendBox(target, w, paneH, d, [0, trayHeight / 2, 0]);
  const tray = appendBox(target, w, trayHeight, d, [0, -h / 2 + trayHeight / 2, 0]);

  return packGlb(
    target,
    [
      materialJson('board', [0.97, 0.97, 0.97, 1], 0.32, 0),
      materialJson('tray', trayColor, 0.5, 0.08),
    ],
    [
      { indexStart: board.indexStart, indexCount: board.indexCount, material: 0 },
      { indexStart: tray.indexStart, indexCount: tray.indexCount, material: 1 },
    ],
  );
}
