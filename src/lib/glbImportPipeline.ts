import { decimateGlb, shouldSkipDecimation } from './decimateGlb';
import { formatInchDim, readGlbAxisBounds } from './glbBounds';
import type { InchSize } from './importedItemSize';
import { DEFAULT_IMPORTED_MAX_SIDE, maxInchSide } from './importedItemSize';
import { prepareImportedGlb } from './prepareImportedGlb';
import { proportionalSizesFromMaxSide } from './uniformItemSize';

const GLB_BOUNDS_TIMEOUT_MS = 30_000;

export interface PreparedGlbUpload {
  uploadFile: File;
  warning: string | null;
}

export async function readGlbAxisBoundsWithTimeout(
  file: File,
  timeoutMs = GLB_BOUNDS_TIMEOUT_MS,
): Promise<InchSize | null> {
  return Promise.race([
    readGlbAxisBounds(file),
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), timeoutMs);
    }),
  ]);
}

export function inchDimensionsFromBounds(bounds: InchSize): InchSize {
  return maxInchSide(bounds) > 3
    ? bounds
    : proportionalSizesFromMaxSide(bounds, DEFAULT_IMPORTED_MAX_SIDE);
}

export function formatInchDimensions(bounds: InchSize): {
  widthIn: string;
  heightIn: string;
  depthIn: string;
} {
  const dims = inchDimensionsFromBounds(bounds);
  return {
    widthIn: formatInchDim(dims[0]),
    heightIn: formatInchDim(dims[1]),
    depthIn: formatInchDim(Math.max(0.25, dims[2])),
  };
}

export async function prepareGlbForCatalogUpload(file: File): Promise<PreparedGlbUpload> {
  if (shouldSkipDecimation(file)) {
    const isGenerated = file.name.toLowerCase() === 'generated.glb';
    if (isGenerated) {
      try {
        const prepared = await prepareImportedGlb(file);
        return { uploadFile: prepared, warning: null };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Lighting prep failed.';
        return {
          uploadFile: file,
          warning: `Lighting prep skipped — using original model. (${message})`,
        };
      }
    }
    return {
      uploadFile: file,
      warning: 'Optimization skipped for large model — using original file.',
    };
  }

  try {
    const result = await decimateGlb(file);
    return { uploadFile: result.file, warning: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Mesh optimization failed.';
    return {
      uploadFile: file,
      warning: `Optimization skipped — using original model. (${message})`,
    };
  }
}
