import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { finishColor, shadeHex } from '../lib/furnitureFinish';
import type { Item } from '../store';

export function useFurnitureFinish(item: Item, fallbackColor: string) {
  const map = useFinishMap(item.finishTextureUrl, item.size);
  const color = map ? '#ffffff' : finishColor(item, fallbackColor);
  const trim = shadeHex(map ? fallbackColor : color, -32);
  return { map, color, trim };
}

function useFinishMap(url: string | undefined, size: [number, number, number]) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!url) {
      setTexture(null);
      return;
    }
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      url,
      (tex) => {
        if (cancelled) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 8;
        tex.needsUpdate = true;
        setTexture(tex);
      },
      undefined,
      () => {
        if (!cancelled) setTexture(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(
    () => () => {
      texture?.dispose();
    },
    [texture],
  );

  useEffect(() => {
    if (!texture) return;
    texture.repeat.set(Math.max(1, size[0] / 28), Math.max(1, size[1] / 40));
    texture.needsUpdate = true;
  }, [texture, size[0], size[1]]);

  return texture;
}
