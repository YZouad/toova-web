/** Max upload size for room-scan video (bytes). */
export const ROOM_SCAN_MAX_VIDEO_BYTES = 80 * 1024 * 1024;

/** Target number of keyframes sent to vision. */
export const ROOM_SCAN_KEYFRAME_COUNT = 10;

/** Max duration we attempt to read (seconds). */
export const ROOM_SCAN_MAX_DURATION_SEC = 60;

/** Long edge cap for JPEG keyframes (keeps API payloads smaller). */
export const ROOM_SCAN_FRAME_MAX_PX = 768;

/** Max still-image upload (bytes); aligns with Bedrock vision sampling on BFF. */
export const ROOM_SCAN_MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const ROOM_SCAN_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const ROOM_SCAN_IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

/** True when the file looks like a room-scan still image. */
export function isRoomScanImageFile(file: File): boolean {
  const type = file.type.trim().toLowerCase();
  if (type && ROOM_SCAN_IMAGE_TYPES.has(type)) return true;
  if (type.startsWith('video/')) return false;
  return ROOM_SCAN_IMAGE_EXT.test(file.name);
}

export function assertRoomScanImageFileSize(file: File): void {
  if (file.size > ROOM_SCAN_MAX_IMAGE_BYTES) {
    throw new Error('Photo is too large (max 15 MB). Use a smaller image and try again.');
  }
}

export function pickKeyframeTimes(durationSec: number, count = ROOM_SCAN_KEYFRAME_COUNT): number[] {
  const safeDuration = Math.min(
    ROOM_SCAN_MAX_DURATION_SEC,
    Math.max(0.5, Number.isFinite(durationSec) ? durationSec : 1),
  );
  const n = Math.max(2, Math.min(count, 12));
  if (safeDuration <= 0.5) return [0];
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = (safeDuration * (i + 0.5)) / n;
    times.push(Math.min(safeDuration - 0.05, Math.max(0, t)));
  }
  return times;
}

export function scaleCanvasToMaxEdge(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxEdge) return { width, height };
  const scale = maxEdge / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function cropJpegDataUrl(
  frameDataUrl: string,
  bbox: { xmin: number; ymin: number; xmax: number; ymax: number },
  quality = 0.85,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const x0 = Math.floor(bbox.xmin * w);
      const y0 = Math.floor(bbox.ymin * h);
      const x1 = Math.ceil(bbox.xmax * w);
      const y1 = Math.ceil(bbox.ymax * h);
      const cw = Math.max(1, x1 - x0);
      const ch = Math.max(1, y1 - y0);
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not crop frame'));
        return;
      }
      ctx.drawImage(img, x0, y0, cw, ch, 0, 0, cw, ch);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Could not load frame for crop'));
    img.src = frameDataUrl;
  });
}

async function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  if (Math.abs(video.currentTime - timeSec) < 0.05) return;
  await new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      reject(new Error('Could not read video frame'));
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = timeSec;
  });
}

function captureFrameJpeg(video: HTMLVideoElement, quality = 0.82): string {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error('Video has no frame size');
  const { width, height } = scaleCanvasToMaxEdge(vw, vh, ROOM_SCAN_FRAME_MAX_PX);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not capture frame');
  ctx.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

function imageElementToJpegDataUrl(img: HTMLImageElement, quality = 0.85): string {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) throw new Error('Photo has no pixel size.');
  const { width, height } = scaleCanvasToMaxEdge(w, h, ROOM_SCAN_FRAME_MAX_PX);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare photo');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

/** Load a still image and return one JPEG data URL for vision analyze. */
export async function extractRoomScanFrameFromImageFile(file: File): Promise<string> {
  if (!isRoomScanImageFile(file)) {
    throw new Error('Choose a JPEG, PNG, or WebP photo of the room.');
  }
  assertRoomScanImageFileSize(file);
  const url = URL.createObjectURL(file);
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          resolve(imageElementToJpegDataUrl(img));
        } catch (e) {
          reject(e instanceof Error ? e : new Error('Could not prepare photo'));
        }
      };
      img.onerror = () =>
        reject(new Error('Could not read this photo. Try JPEG or PNG.'));
      img.src = url;
    });
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Extract evenly spaced JPEG data URLs from a user-selected video file. */
export async function extractRoomScanKeyframesFromFile(file: File): Promise<string[]> {
  if (file.size > ROOM_SCAN_MAX_VIDEO_BYTES) {
    throw new Error('Video is too large (max 80 MB). Trim or compress it and try again.');
  }
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Could not read this video format. Try MP4 or WebM.'));
    });
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('Could not determine video length.');
    }
    if (duration > ROOM_SCAN_MAX_DURATION_SEC) {
      throw new Error(`Video is too long (max ${ROOM_SCAN_MAX_DURATION_SEC} seconds).`);
    }
    const times = pickKeyframeTimes(duration);
    const frames: string[] = [];
    for (const t of times) {
      await seekVideo(video, t);
      frames.push(captureFrameJpeg(video));
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}

export async function attachScanPhotosToSidecar(
  frames: string[],
  sidecar: Record<
    string,
    {
      frameIndex?: number;
      bbox?: { xmin: number; ymin: number; xmax: number; ymax: number };
    }
  >,
): Promise<Record<string, string>> {
  const photos: Record<string, string> = {};
  for (const [scanId, meta] of Object.entries(sidecar)) {
    const idx = meta.frameIndex ?? 0;
    const frame = frames[Math.min(frames.length - 1, Math.max(0, idx))];
    if (!frame) continue;
    try {
      photos[scanId] = meta.bbox
        ? await cropJpegDataUrl(frame, meta.bbox)
        : frame;
    } catch {
      photos[scanId] = frame;
    }
  }
  return photos;
}
