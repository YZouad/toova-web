import { useMemo } from 'react';
import * as THREE from 'three';
import type { BeddingColor } from './types';

const SIZE = 256;
const cache = new Map<string, THREE.CanvasTexture>();

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hash2(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * hash2(x * freq, y * freq, seed + i * 19);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function paintPattern(
  ctx: CanvasRenderingContext2D,
  patternId: string,
  hex: string,
): void {
  const img = ctx.createImageData(SIZE, SIZE);
  const [br, bg, bb] = hexToRgb(hex);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const v = y / SIZE;
      let r = br;
      let g = bg;
      let b = bb;

      switch (patternId) {
        case 'striped': {
          const stripe = Math.floor(v * 16) % 2 === 0 ? 1 : 0.82;
          r *= stripe;
          g *= stripe;
          b *= stripe;
          break;
        }
        case 'checkered': {
          const cell = (Math.floor(u * 8) + Math.floor(v * 8)) % 2 === 0 ? 1 : 0.78;
          r *= cell;
          g *= cell;
          b *= cell;
          break;
        }
        case 'plaid': {
          const bandX = Math.sin(u * Math.PI * 6) > 0.2 ? 1 : 0.75;
          const bandY = Math.sin(v * Math.PI * 6) > 0.2 ? 1 : 0.75;
          const mix = bandX * bandY;
          r *= mix;
          g *= mix;
          b *= mix;
          break;
        }
        case 'floral': {
          const cx = (u - 0.5) * 8;
          const cy = (v - 0.5) * 8;
          const petal = Math.sin(cx * 3) * Math.cos(cy * 3);
          const bloom = petal > 0.35 ? 0.88 : 1;
          r *= bloom;
          g *= bloom;
          b *= bloom;
          break;
        }
        default: {
          const n = fbm(u * 8, v * 8, 42, 4);
          const tint = 0.92 + n * 0.08;
          r *= tint;
          g *= tint;
          b *= tint;
        }
      }

      const i = (y * SIZE + x) * 4;
      img.data[i] = Math.min(255, r);
      img.data[i + 1] = Math.min(255, g);
      img.data[i + 2] = Math.min(255, b);
      img.data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
}

export function getBeddingTexture(patternId: string, hex: string): THREE.CanvasTexture {
  const key = `${patternId}:${hex.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create bedding texture canvas');

  paintPattern(ctx, patternId, hex);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  cache.set(key, texture);
  return texture;
}

export function useBeddingMaterial(
  color: BeddingColor,
  patternId: string,
): THREE.MeshStandardMaterial {
  return useMemo(() => {
    const map = getBeddingTexture(patternId, color.hex);
    return new THREE.MeshStandardMaterial({
      map,
      color: '#ffffff',
      roughness: 0.9,
      metalness: 0,
    });
  }, [color.hex, color.id, patternId]);
}
