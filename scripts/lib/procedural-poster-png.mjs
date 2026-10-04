/**
 * Deterministic CC0 procedural poster PNGs for the agentic poster bank.
 * Pure JS — no native canvas dependency.
 */

import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, getPixel) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * stride;
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a = 255] = getPixel(x, y);
      const i = rowStart + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function blockColor(x, y, blockW, blockH, colors) {
  const bx = Math.floor(x / blockW);
  const by = Math.floor(y / blockH);
  const shade = (bx + by) % 2 === 0 ? 0 : 18;
  const base = colors[by] ?? colors[colors.length - 1];
  return [Math.max(0, base[0] - shade), Math.max(0, base[1] - shade), Math.max(0, base[2] - shade)];
}

/** Green pixel-block landscape (Minecraft-like, trademark-free). */
export function generatePixelBlocksPng() {
  const w = 320;
  const h = 480;
  const blockW = 20;
  const blockH = 20;
  const horizon = Math.floor(h * 0.42);
  return encodePng(w, h, (x, y) => {
    if (y < horizon) {
      const band = Math.floor(y / 24);
      const sky = band % 2 === 0 ? [102, 178, 255] : [88, 160, 240];
      return sky;
    }
    const row = Math.floor((y - horizon) / blockH);
    const grassRows = 3;
    if (row < grassRows) {
      return blockColor(x, y - horizon, blockW, blockH, [
        [92, 153, 62],
        [76, 132, 52],
        [68, 118, 46],
      ]);
    }
    return blockColor(x, y - horizon, blockW, blockH, [
      [110, 78, 48],
      [96, 68, 42],
      [82, 58, 36],
      [74, 52, 32],
    ]);
  });
}

/** Retro ASCII terminal gaming aesthetic. */
export function generateAsciiGamingPng() {
  const w = 320;
  const h = 480;
  const glyphs = [
    '> PLAY',
    '[###]',
    '|@ @|',
    '| - |',
    '|___|',
    'SCORE',
    '1337',
  ];
  return encodePng(w, h, (x, y) => {
    const bg = [12, 18, 14];
    const fg = [72, 220, 120];
    const accent = [220, 180, 60];
    const lineH = 28;
    const startY = 80;
    const charW = 10;
    for (let li = 0; li < glyphs.length; li += 1) {
      const text = glyphs[li];
      const ty = startY + li * lineH;
      if (y >= ty && y < ty + 18) {
        const col = li === glyphs.length - 1 ? accent : fg;
        for (let ci = 0; ci < text.length; ci += 1) {
          const tx = 40 + ci * charW;
          if (x >= tx && x < tx + charW - 2) {
            const ch = text[ci];
            if (ch !== ' ') {
              const hash = (ci * 17 + li * 31 + x + y) % 5;
              if (hash !== 0) return col;
            }
          }
        }
      }
    }
    if (y > h - 60 && x > 40 && x < w - 40 && (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0) {
      return [28, 36, 32];
    }
    return bg;
  });
}

/** Neon arcade cabinet pixel art. */
export function generateRetroArcadePng() {
  const w = 320;
  const h = 480;
  return encodePng(w, h, (x, y) => {
    const bg = [18, 14, 28];
    const cabinet = [44, 44, 58];
    const screen = [24, 32, 48];
    const neon = [255, 64, 128];
    const neon2 = [64, 200, 255];
    const cx = w / 2;
    const cabW = 140;
    const cabTop = 60;
    const cabBottom = h - 40;
    if (x >= cx - cabW / 2 && x < cx + cabW / 2 && y >= cabTop && y < cabBottom) {
      const relX = x - (cx - cabW / 2);
      const relY = y - cabTop;
      if (relY < 100 && relX > 20 && relX < cabW - 20) {
        const px = Math.floor(relX / 8);
        const py = Math.floor(relY / 8);
        if ((px + py) % 3 === 0) return neon;
        if ((px + py) % 5 === 0) return neon2;
        return screen;
      }
      if (relY > cabBottom - cabTop - 50) return [32, 32, 40];
      return cabinet;
    }
    if (y < 40 && Math.abs(x - cx) < 60) return neon;
    return bg;
  });
}

export function proceduralPosterBytes(kind) {
  switch (kind) {
    case 'pixel-blocks':
      return generatePixelBlocksPng();
    case 'ascii-gaming':
      return generateAsciiGamingPng();
    case 'retro-arcade':
      return generateRetroArcadePng();
    default:
      throw new Error(`Unknown procedural poster kind: ${kind}`);
  }
}
