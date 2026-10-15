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

function hash2(x, y, seed = 0) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 17.3) * 43758.5453;
  return n - Math.floor(n);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(a, b, t) {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}

function verticalGradient(w, h, top, bottom) {
  return (x, y) => lerpColor(top, bottom, y / Math.max(1, h - 1));
}

function bandedSky(w, h, bands, horizon = 0.55) {
  const horizonY = Math.floor(h * horizon);
  return (x, y) => {
    if (y >= horizonY) return bands[bands.length - 1];
    const t = y / Math.max(1, horizonY - 1);
    const idx = Math.min(bands.length - 1, Math.floor(t * bands.length));
    return bands[idx];
  };
}

function horizonGround(w, h, skyFn, groundColors, horizon = 0.55) {
  const horizonY = Math.floor(h * horizon);
  return (x, y) => {
    if (y < horizonY) return skyFn(x, y);
    const row = Math.floor((y - horizonY) / 12);
    const base = groundColors[row % groundColors.length];
    const shade = (Math.floor(x / 16) + row) % 2 === 0 ? 0 : 14;
    return [Math.max(0, base[0] - shade), Math.max(0, base[1] - shade), Math.max(0, base[2] - shade)];
  };
}

function radialGlow(w, h, cx, cy, radius, inner, outer) {
  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const t = Math.min(1, Math.sqrt(dx * dx + dy * dy) / radius);
    return lerpColor(inner, outer, t);
  };
}

function layered(fn, overlayFn, mix = 0.55) {
  return (x, y) => {
    const base = fn(x, y);
    const over = overlayFn(x, y);
    return lerpColor(base, over, mix);
  };
}

/** Deterministic CC0 style posters (320×480, 2:3). */
const STYLE_RENDERERS = {
  'aurora-gradient': () => {
    const w = 320;
    const h = 480;
    const sky = verticalGradient(w, h, [8, 12, 32], [16, 48, 72]);
    return encodePng(w, h, (x, y) => {
      const base = sky(x, y);
      const wave = Math.sin(x * 0.02 + y * 0.008) * 0.5 + 0.5;
      if (y < h * 0.65 && wave > 0.62) {
        return lerpColor(base, [64, 220, 160], (wave - 0.62) * 2.2);
      }
      if (y < h * 0.55 && wave > 0.78) {
        return lerpColor(base, [180, 90, 255], (wave - 0.78) * 3);
      }
      return base;
    });
  },
  'desert-sunset': () => {
    const w = 320;
    const h = 480;
    const sky = bandedSky(w, h, [
      [38, 28, 58],
      [120, 52, 72],
      [220, 110, 60],
      [255, 180, 90],
    ], 0.62);
    return encodePng(w, h, horizonGround(w, h, sky, [[168, 118, 72], [142, 98, 58], [118, 82, 48]], 0.62));
  },
  'ocean-deep': () => {
    const w = 320;
    const h = 480;
    return encodePng(w, h, (x, y) => {
      const depth = y / h;
      const base = lerpColor([24, 88, 140], [4, 24, 48], depth);
      const ripple = Math.sin(x * 0.05 + y * 0.03) * 8;
      return [Math.max(0, base[0] + ripple), Math.max(0, base[1] + ripple), Math.max(0, base[2] + ripple)];
    });
  },
  'forest-mist': () => {
    const w = 320;
    const h = 480;
    const sky = verticalGradient(w, h, [180, 200, 210], [120, 150, 130]);
    return encodePng(w, h, horizonGround(w, h, sky, [[52, 92, 58], [42, 78, 48], [34, 66, 40]], 0.48));
  },
  'cherry-blossom-pink': () => {
    const w = 320;
    const h = 480;
    const sky = verticalGradient(w, h, [240, 220, 230], [255, 248, 252]);
    return encodePng(w, h, (x, y) => {
      const base = sky(x, y);
      const petal = hash2(Math.floor(x / 6), Math.floor(y / 6), 3);
      if (petal > 0.82 && y > h * 0.15 && y < h * 0.85) {
        return lerpColor(base, [255, 170, 190], 0.65);
      }
      return base;
    });
  },
  synthwave: () => {
    const w = 320;
    const h = 480;
    return encodePng(w, h, (x, y) => {
      const horizon = h * 0.55;
      if (y < horizon) {
        return lerpColor([24, 8, 48], [255, 70, 180], y / horizon);
      }
      const gridY = y - horizon;
      const persp = gridY / (h - horizon);
      const line = Math.abs((x - w / 2) * (0.4 + persp * 1.6)) % 28 < 2;
      const row = gridY % 22 < 2;
      if (line || row) return [255, 60, 180];
      return [12, 6, 28];
    });
  },
  'neon-grid': () => {
    const w = 320;
    const h = 480;
    return encodePng(w, h, (x, y) => {
      const bg = [10, 14, 24];
      const grid = x % 24 < 2 || y % 24 < 2;
      if (grid) return [40, 220, 255];
      if (y > h * 0.72 && x > w * 0.2 && x < w * 0.8) return [255, 80, 120];
      return bg;
    });
  },
  'zen-stones': () => {
    const w = 320;
    const h = 480;
    const bg = verticalGradient(w, h, [210, 220, 225], [180, 190, 195]);
    const stones = [
      { cx: 160, cy: 340, r: 48 },
      { cx: 130, cy: 390, r: 36 },
      { cx: 190, cy: 400, r: 28 },
    ];
    return encodePng(w, h, (x, y) => {
      let c = bg(x, y);
      for (const s of stones) {
        const d = Math.hypot(x - s.cx, y - s.cy);
        if (d < s.r) c = lerpColor(c, [90, 92, 96], 1 - d / s.r);
      }
      return c;
    });
  },
  starfield: () => {
    const w = 320;
    const h = 480;
    const bg = verticalGradient(w, h, [8, 12, 28], [20, 24, 48]);
    return encodePng(w, h, (x, y) => {
      const base = bg(x, y);
      const star = hash2(x, y, 9);
      if (star > 0.992) return [255, 255, 240];
      if (star > 0.985) return [200, 210, 255];
      return base;
    });
  },
  terrazzo: () => {
    const w = 320;
    const h = 480;
    const base = [230, 226, 218];
    const chips = [[210, 90, 70], [70, 120, 150], [180, 170, 90], [100, 100, 100]];
    return encodePng(w, h, (x, y) => {
      const cell = hash2(Math.floor(x / 8), Math.floor(y / 8), 1);
      if (cell > 0.78) return chips[Math.floor(cell * chips.length) % chips.length];
      return base;
    });
  },
  'marble-swirl': () => {
    const w = 320;
    const h = 480;
    return encodePng(w, h, (x, y) => {
      const n = Math.sin(x * 0.02 + y * 0.015) + Math.sin(y * 0.025 - x * 0.01);
      const t = (n + 2) / 4;
      return lerpColor([240, 238, 235], [200, 198, 195], t);
    });
  },
  'geometric-grid': () => {
    const w = 320;
    const h = 480;
    const palette = [[220, 60, 60], [240, 210, 60], [40, 90, 200], [240, 240, 240]];
    return encodePng(w, h, (x, y) => {
      const bx = Math.floor(x / 40);
      const by = Math.floor(y / 40);
      return palette[(bx + by) % palette.length];
    });
  },
  'lavender-mist': () => {
    const w = 320;
    const h = 480;
    return encodePng(w, h, verticalGradient(w, h, [220, 200, 240], [160, 130, 190]));
  },
  'autumn-leaves': () => {
    const w = 320;
    const h = 480;
    const sky = verticalGradient(w, h, [200, 210, 230], [255, 230, 200]);
    return encodePng(w, h, (x, y) => {
      const base = y < h * 0.45 ? sky(x, y) : lerpColor([180, 100, 40], [120, 60, 30], (y - h * 0.45) / (h * 0.55));
      const leaf = hash2(Math.floor(x / 5), Math.floor(y / 5), 5);
      if (leaf > 0.84) return [210, 90, 30];
      return base;
    });
  },
  'winter-frost': () => {
    const w = 320;
    const h = 480;
    return encodePng(w, h, (x, y) => {
      const base = lerpColor([210, 225, 240], [240, 248, 255], y / h);
      const frost = hash2(Math.floor(x / 4), Math.floor(y / 4), 7);
      if (frost > 0.9) return [255, 255, 255];
      return base;
    });
  },
  'tropical-sunset': () => {
    const w = 320;
    const h = 480;
    const sky = bandedSky(w, h, [[255, 120, 60], [255, 180, 100], [120, 180, 220]], 0.58);
    return encodePng(w, h, (x, y) => {
      if (y < h * 0.58) return sky(x, y);
      if (y > h * 0.72 && Math.abs(x - 260) < 18) return [20, 90, 40];
      return [24, 140, 90];
    });
  },
  'coral-underwater': () => {
    const w = 320;
    const h = 480;
    return encodePng(w, h, (x, y) => {
      const base = lerpColor([20, 120, 150], [8, 40, 80], y / h);
      const coral = hash2(Math.floor(x / 10), Math.floor(y / 10), 11);
      if (coral > 0.82 && y > h * 0.35) return [255, 110, 100];
      return base;
    });
  },
  'coffee-warm': () => {
    const w = 320;
    const h = 480;
    return encodePng(w, h, radialGlow(w, h, 160, 320, 220, [60, 36, 24], [180, 140, 100]));
  },
  'blush-abstract': () => {
    const w = 320;
    const h = 480;
    return encodePng(w, h, layered(
      verticalGradient(w, h, [255, 230, 235], [240, 200, 210]),
      (x, y) => lerpColor([255, 180, 190], [255, 220, 225], hash2(x, y, 2)),
      0.35,
    ));
  },
  'navy-stripes': () => {
    const w = 320;
    const h = 480;
    return encodePng(w, h, (x, y) => {
      const stripe = Math.floor(y / 18) % 2 === 0;
      return stripe ? [16, 36, 72] : [240, 240, 235];
    });
  },
  'chess-board': () => {
    const w = 320;
    const h = 480;
    return encodePng(w, h, (x, y) => {
      const cell = (Math.floor(x / 32) + Math.floor(y / 32)) % 2 === 0;
      return cell ? [240, 236, 228] : [32, 32, 36];
    });
  },
  'vinyl-record': () => {
    const w = 320;
    const h = 480;
    return encodePng(w, h, (x, y) => {
      const d = Math.hypot(x - 160, y - 240);
      if (d > 130) return [28, 24, 32];
      if (d < 18) return [220, 60, 60];
      const groove = Math.sin(d * 0.25) * 12;
      return [30 + groove, 28 + groove, 34 + groove];
    });
  },
  'rain-moody': () => {
    const w = 320;
    const h = 480;
    const bg = verticalGradient(w, h, [50, 58, 68], [28, 32, 38]);
    return encodePng(w, h, (x, y) => {
      const base = bg(x, y);
      const rain = hash2(x + Math.floor(y / 6), y, 13) > 0.94;
      return rain ? lerpColor(base, [180, 190, 200], 0.4) : base;
    });
  },
  'crystal-prism': () => {
    const w = 320;
    const h = 480;
    return encodePng(w, h, (x, y) => {
      const t = (Math.sin(x * 0.04) + Math.sin(y * 0.03) + 2) / 4;
      if (t < 0.33) return [180, 120, 255];
      if (t < 0.66) return [120, 200, 255];
      return [255, 180, 220];
    });
  },
  'lightning-flash': () => {
    const w = 320;
    const h = 480;
    const storm = verticalGradient(w, h, [30, 34, 48], [18, 20, 28]);
    return encodePng(w, h, (x, y) => {
      const base = storm(x, y);
      const bolt = Math.abs(x - (160 + Math.sin(y * 0.08) * 40)) < 4 && y > 80 && y < 360;
      if (bolt) return [240, 240, 255];
      return base;
    });
  },
  'balloon-sky': () => {
    const w = 320;
    const h = 480;
    const sky = verticalGradient(w, h, [120, 180, 240], [220, 235, 255]);
    const balloons = [[80, 180, 28, [220, 60, 80]], [200, 220, 32, [255, 180, 60]], [140, 300, 24, [80, 160, 255]]];
    return encodePng(w, h, (x, y) => {
      let c = sky(x, y);
      for (const [bx, by, r, col] of balloons) {
        if (Math.hypot(x - bx, y - by) < r) c = col;
      }
      return c;
    });
  },
  'surf-tropical': () => {
    const w = 320;
    const h = 480;
    const sky = verticalGradient(w, h, [80, 170, 240], [200, 230, 255]);
    return encodePng(w, h, (x, y) => {
      if (y < h * 0.42) return sky(x, y);
      const wave = Math.sin(x * 0.06 + y * 0.04) * 10;
      return [20 + wave, 140 + wave, 180 + wave];
    });
  },
  'yoga-calm': () => {
    const w = 320;
    const h = 480;
    return encodePng(w, h, verticalGradient(w, h, [220, 235, 225], [180, 210, 195]));
  },
  'film-noir': () => {
    const w = 320;
    const h = 480;
    return encodePng(w, h, (x, y) => {
      const g = Math.round(40 + (x / w) * 80 + hash2(x, y, 4) * 30);
      return [g, g, g];
    });
  },
  'pop-dots': () => {
    const w = 320;
    const h = 480;
    const bg = [255, 240, 0];
    return encodePng(w, h, (x, y) => {
      const dx = (x % 24) - 12;
      const dy = (y % 24) - 12;
      if (dx * dx + dy * dy < 36) {
        const colors = [[255, 0, 90], [0, 120, 255], [0, 0, 0]];
        return colors[(Math.floor(x / 24) + Math.floor(y / 24)) % colors.length];
      }
      return bg;
    });
  },
  'sunset-band': () => {
    const w = 320;
    const h = 480;
    return encodePng(w, h, bandedSky(w, h, [
      [255, 120, 80],
      [255, 170, 90],
      [255, 210, 140],
      [180, 210, 240],
    ], 1));
  },
  'mint-fresh': () => {
    const w = 320;
    const h = 480;
    return encodePng(w, h, verticalGradient(w, h, [200, 245, 230], [140, 210, 180]));
  },
  'rust-industrial': () => {
    const w = 320;
    const h = 480;
    return encodePng(w, h, (x, y) => {
      const n = hash2(Math.floor(x / 6), Math.floor(y / 6), 15);
      return lerpColor([120, 58, 36], [70, 38, 28], n);
    });
  },
  'galaxy-spiral': () => {
    const w = 320;
    const h = 480;
    return encodePng(w, h, (x, y) => {
      const dx = x - 160;
      const dy = y - 240;
      const angle = Math.atan2(dy, dx);
      const dist = Math.hypot(dx, dy);
      const spiral = Math.sin(angle * 3 + dist * 0.04);
      const base = [8, 10, 24];
      if (spiral > 0.55 && dist < 160) return lerpColor(base, [180, 160, 255], (spiral - 0.55) * 2);
      return base;
    });
  },
  'cloud-dreamy': () => {
    const w = 320;
    const h = 480;
    const sky = verticalGradient(w, h, [170, 200, 255], [255, 255, 255]);
    return encodePng(w, h, (x, y) => {
      const base = sky(x, y);
      const cloud = Math.sin(x * 0.015 + 1.2) * Math.sin(y * 0.012 + 0.5);
      if (cloud > 0.55) return lerpColor(base, [255, 255, 255], (cloud - 0.55) * 1.5);
      return base;
    });
  },
};

export function generateStyledPosterPng(styleId) {
  const fn = STYLE_RENDERERS[styleId];
  if (!fn) throw new Error(`Unknown styled procedural poster: ${styleId}`);
  return fn();
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
      if (STYLE_RENDERERS[kind]) return generateStyledPosterPng(kind);
      throw new Error(`Unknown procedural poster kind: ${kind}`);
  }
}
