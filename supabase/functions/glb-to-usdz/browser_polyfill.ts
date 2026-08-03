// Minimal browser image/canvas APIs for three.js GLTFLoader + USDZExporter in Deno.
// Idempotent: safe to call multiple times per isolate (only first call installs shims).
// @ts-ignore Deno resolves remote imports at deploy time.
import { Image as ISImage } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const MAX_TEXTURE_DIMENSION = 2048;
const INSTALL_FLAG = "__arvisBrowserImagePolyfillInstalled";
const BLOB_REGISTRY = new Map<string, Blob>();
let blobUrlCounter = 0;

/** Captured before GLTFLoader forces ImageBitmapLoader when createImageBitmap exists. */
export const nativeCreateImageBitmap = typeof globalThis.createImageBitmap === "function"
  ? globalThis.createImageBitmap.bind(globalThis)
  : null;

type RGBAImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export function installBrowserImagePolyfills(): void {
  const globals = globalThis as Record<string, unknown>;
  if (globals[INSTALL_FLAG]) {
    return;
  }
  globals[INSTALL_FLAG] = true;

  // Prefer TextureLoader (Image) over ImageBitmapLoader. Deno may define createImageBitmap;
  // GLTFLoader picks ImageBitmapLoader when it exists, which fails in this environment.
  try {
    delete (globalThis as Record<string, unknown>).createImageBitmap;
  } catch {
    /* ignore */
  }

  if (!("self" in globalThis)) {
    Object.defineProperty(globalThis, "self", { value: globalThis });
  }

  const globalObj = globalThis as typeof globalThis & {
    Image?: typeof PolyfillImage;
    HTMLImageElement?: typeof PolyfillImage;
    HTMLCanvasElement?: typeof PolyfillCanvasElement;
    OffscreenCanvas?: typeof PolyfillOffscreenCanvas;
  };

  // Do not define global createImageBitmap: GLTFLoader switches to ImageBitmapLoader when it
  // exists, and that path expects browser-native ImageBitmap semantics. Leaving it undefined
  // keeps TextureLoader, which loads via `Image` / URLs — compatible with PolyfillImage below.
  chainBrowserPrototype(PolyfillImage, globalObj.HTMLImageElement);
  chainBrowserPrototype(PolyfillCanvasElement, globalObj.HTMLCanvasElement);
  chainBrowserPrototype(PolyfillOffscreenCanvas, globalObj.OffscreenCanvas);

  globalObj.Image = PolyfillImage;
  globalObj.HTMLImageElement = PolyfillImage;
  globalObj.HTMLCanvasElement = PolyfillCanvasElement;
  globalObj.OffscreenCanvas = PolyfillOffscreenCanvas;

  const documentShim = {
    createElement(tagName: string) {
      return createDocumentElement(tagName);
    },
    createElementNS(_namespace: string, tagName: string) {
      return createDocumentElement(tagName);
    },
  };

  const documentDescriptor = Object.getOwnPropertyDescriptor(globalObj, "document");
  if (!documentDescriptor || documentDescriptor.configurable !== false) {
    Object.defineProperty(globalObj, "document", {
      value: documentShim,
      configurable: true,
      writable: true,
    });
  } else {
    const existingDocument = globalObj.document as typeof documentShim & Record<string, unknown>;
    existingDocument.createElement = documentShim.createElement;
    existingDocument.createElementNS = documentShim.createElementNS;
  }

  installBlobUrlRegistry();
}

function installBlobUrlRegistry(): void {
  const urlObject = URL as typeof URL & {
    createObjectURL?: (blob: Blob) => string;
    revokeObjectURL?: (url: string) => void;
  };

  urlObject.createObjectURL = (blob: Blob): string => {
    const url = `blob:arvis-${blobUrlCounter++}`;
    BLOB_REGISTRY.set(url, blob);
    return url;
  };
  urlObject.revokeObjectURL = (url: string): void => {
    BLOB_REGISTRY.delete(url);
  };

  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const blob = BLOB_REGISTRY.get(url);
    if (blob) {
      return Promise.resolve(new Response(blob, init));
    }
    return nativeFetch(input, init);
  };
}

export { decodeBlobToRGBA };

function chainBrowserPrototype(
  polyfillClass: { prototype: object },
  nativeClass: unknown,
): void {
  if (typeof nativeClass !== "function") {
    return;
  }
  const nativeProto = (nativeClass as { prototype?: object }).prototype;
  if (nativeProto) {
    Object.setPrototypeOf(polyfillClass.prototype, nativeProto);
  }
}

function createDocumentElement(tagName: string): PolyfillCanvasElement | PolyfillImage {
  const tag = tagName.toLowerCase();
  if (tag === "canvas") {
    return new PolyfillCanvasElement(300, 150);
  }
  if (tag === "img" || tag === "image") {
    return new PolyfillImage();
  }
  throw new Error(`Unsupported document element tag: ${tagName}`);
}

async function decodeBlobToRGBA(blob: Blob): Promise<RGBAImage> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let image = await ISImage.decode(bytes);
  image = constrainTextureSize(image);
  const raw = image.bitmap;
  const copy = new Uint8ClampedArray(raw.byteLength);
  copy.set(new Uint8ClampedArray(raw.buffer, raw.byteOffset, raw.byteLength));
  return {
    width: image.width,
    height: image.height,
    data: copy,
  };
}

function constrainTextureSize(image: ISImage): ISImage {
  const maxSide = Math.max(image.width, image.height);
  if (maxSide <= MAX_TEXTURE_DIMENSION) {
    return image;
  }

  const scale = MAX_TEXTURE_DIMENSION / maxSide;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  return image.resize(width, height);
}

class PolyfillImage {
  width = 0;
  height = 0;
  naturalWidth = 0;
  naturalHeight = 0;
  complete = false;
  crossOrigin: string | null = null;
  onload: (() => void) | null = null;
  onerror: ((error?: unknown) => void) | null = null;

  private _src = "";
  private pixelData: Uint8ClampedArray | null = null;
  private readonly loadListeners: Array<() => void> = [];
  private readonly errorListeners: Array<(error?: unknown) => void> = [];

  get data(): Uint8ClampedArray | null {
    return this.pixelData;
  }

  get src(): string {
    return this._src;
  }

  set src(value: string) {
    this._src = value;
    void this.load(value);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (listener == null) {
      return;
    }
    const fn = typeof listener === "function"
      ? listener as () => void
      : ((listener as { handleEvent: (e: Event) => void }).handleEvent.bind(listener) as () => void);
    if (type === "load") {
      this.loadListeners.push(fn);
    } else if (type === "error") {
      this.errorListeners.push(fn as (error?: unknown) => void);
    }
  }

  removeEventListener(_type: string, _listener: EventListenerOrEventListenerObject | null): void {
    /* no-op: edge conversion is single-shot */
  }

  private emitLoad(): void {
    this.onload?.();
    for (const fn of this.loadListeners) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
  }

  private emitError(error?: unknown): void {
    this.onerror?.(error);
    for (const fn of this.errorListeners) {
      try {
        fn(error);
      } catch {
        /* ignore */
      }
    }
  }

  private async load(value: string): Promise<void> {
    try {
      let blob: Blob | undefined;

      if (value.startsWith("data:")) {
        blob = dataURLToBlob(value);
      } else {
        const response = await globalThis.fetch(value);
        if (!response.ok) {
          throw new Error(`Failed to load image: ${value} (${response.status})`);
        }
        blob = await response.blob();
      }

      if (!blob) {
        throw new Error(`Unsupported image source: ${value}`);
      }

      const image = await decodeBlobToRGBA(blob);
      this.width = image.width;
      this.height = image.height;
      this.naturalWidth = image.width;
      this.naturalHeight = image.height;
      this.complete = true;
      this.pixelData = image.data;
      this.emitLoad();
    } catch (error) {
      this.emitError(error);
    }
  }
}

export function dataURLToBlob(dataURL: string): Blob {
  const comma = dataURL.indexOf(",");
  if (comma < 0) {
    throw new Error("Invalid data URL");
  }
  const meta = dataURL.slice(0, comma);
  const data = dataURL.slice(comma + 1);
  let bytes: Uint8Array;
  if (meta.includes(";base64")) {
    const binary = atob(data);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(data));
  }
  const mimeMatch = meta.match(/data:([^;]+)/);
  const type = mimeMatch?.[1] ?? "application/octet-stream";
  return new Blob([bytes], { type });
}

class PolyfillOffscreenCanvas {
  private _width: number;
  private _height: number;
  private readonly context: PolyfillCanvas2DContext;

  constructor(width: number, height: number) {
    this._width = width;
    this._height = height;
    this.context = new PolyfillCanvas2DContext(width, height);
  }

  get width(): number {
    return this._width;
  }

  set width(value: number) {
    this._width = value;
    this.context.resize(value, this._height);
  }

  get height(): number {
    return this._height;
  }

  set height(value: number) {
    this._height = value;
    this.context.resize(this._width, value);
  }

  getContext(type: string): PolyfillCanvas2DContext | null {
    return type === "2d" ? this.context : null;
  }

  toBlob(
    callback: ((blob: Blob | null) => void) | null,
    type?: string,
    _quality?: number,
  ): void {
    void invokeToBlobCallback(this.context, callback, type);
  }

  convertToBlob(options?: { type?: string; quality?: number }): Promise<Blob> {
    return this.context.toBlob(options);
  }
}

class PolyfillCanvas2DContext {
  readonly canvas: { width: number; height: number };
  private pixels: Uint8ClampedArray;
  private translateX = 0;
  private translateY = 0;
  private scaleX = 1;
  private scaleY = 1;

  constructor(width: number, height: number) {
    this.canvas = { width, height };
    this.pixels = new Uint8ClampedArray(width * height * 4);
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.pixels = new Uint8ClampedArray(width * height * 4);
    this.translateX = 0;
    this.translateY = 0;
    this.scaleX = 1;
    this.scaleY = 1;
  }

  translate(tx: number, ty: number): void {
    this.translateX += tx;
    this.translateY += ty;
  }

  scale(sx: number, sy: number): void {
    this.scaleX *= sx;
    this.scaleY *= sy;
  }

  drawImage(
    source: PolyfillImage | { width: number; height: number; data?: Uint8ClampedArray | null },
    dx: number,
    dy: number,
    dw?: number,
    dh?: number,
  ): void {
    const srcWidth = source.width;
    const srcHeight = source.height;
    const destWidth = dw ?? srcWidth;
    const destHeight = dh ?? srcHeight;
    const srcData = source instanceof PolyfillImage
      ? source.data
      : source.data ?? null;

    if (!srcData) {
      return;
    }

    const destW = destWidth * Math.abs(this.scaleX);
    const destH = destHeight * Math.abs(this.scaleY);
    const flipX = this.scaleX < 0;
    const flipY = this.scaleY < 0;
    // USDZExporter: translate(0, height) + scale(1, -1) + drawImage(0,0,w,h)
    const destDx = flipX
      ? this.translateX + (this.canvas.width - destW) - dx * this.scaleX
      : this.translateX + dx * this.scaleX;
    const destDy = flipY && this.translateY > 0
      ? this.translateY - destH - dy * Math.abs(this.scaleY)
      : this.translateY + dy * this.scaleY;

    blitRGBA(
      srcData,
      srcWidth,
      srcHeight,
      this.pixels,
      this.canvas.width,
      this.canvas.height,
      destDx,
      destDy,
      destW,
      destH,
      flipX,
      flipY,
    );
  }

  getImageData(_x: number, _y: number, width: number, height: number): { data: Uint8ClampedArray } {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcIndex = (y * this.canvas.width + x) * 4;
        const destIndex = (y * width + x) * 4;
        data[destIndex] = this.pixels[srcIndex];
        data[destIndex + 1] = this.pixels[srcIndex + 1];
        data[destIndex + 2] = this.pixels[srcIndex + 2];
        data[destIndex + 3] = this.pixels[srcIndex + 3];
      }
    }
    return { data };
  }

  async toBlob(options?: { type?: string; quality?: number }): Promise<Blob> {
    const image = new ISImage(this.canvas.width, this.canvas.height);
    image.bitmap = new Uint8Array(this.pixels);
    const format = options?.type === "image/jpeg" ? ISImage.JPEG : ISImage.PNG;
    const encoded = await image.encode(format);
    const mimeType = options?.type ?? "image/png";
    return new Blob([encoded], { type: mimeType });
  }
}

class PolyfillCanvasElement {
  private _width: number;
  private _height: number;
  private readonly context: PolyfillCanvas2DContext;

  constructor(width: number, height: number) {
    this._width = width;
    this._height = height;
    this.context = new PolyfillCanvas2DContext(width, height);
  }

  get width(): number {
    return this._width;
  }

  set width(value: number) {
    this._width = value;
    this.context.resize(value, this._height);
  }

  get height(): number {
    return this._height;
  }

  set height(value: number) {
    this._height = value;
    this.context.resize(this._width, value);
  }

  getContext(type: string): PolyfillCanvas2DContext | null {
    return type === "2d" ? this.context : null;
  }

  toBlob(
    callback: ((blob: Blob | null) => void) | null,
    type?: string,
    _quality?: number,
  ): void {
    void invokeToBlobCallback(this.context, callback, type);
  }

  async toDataURL(type = "image/png"): Promise<string> {
    const blob = await this.context.toBlob({ type });
    const buffer = await blob.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    return `data:${type};base64,${base64}`;
  }

  convertToBlob(options?: { type?: string; quality?: number }): Promise<Blob> {
    return this.context.toBlob(options);
  }
}

async function invokeToBlobCallback(
  context: PolyfillCanvas2DContext,
  callback: ((blob: Blob | null) => void) | null,
  type?: string,
): Promise<void> {
  if (callback == null) {
    return;
  }
  try {
    const blob = await context.toBlob({ type: type ?? "image/png" });
    callback(blob);
  } catch {
    callback(null);
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

function blitRGBA(
  src: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  dest: Uint8ClampedArray,
  destWidth: number,
  destHeight: number,
  destX: number,
  destY: number,
  destW: number,
  destH: number,
  flipX = false,
  flipY = false,
): void {
  for (let y = 0; y < destH; y++) {
    const srcY = flipY
      ? Math.min(srcHeight - 1, Math.floor(((destH - 1 - y) / destH) * srcHeight))
      : Math.min(srcHeight - 1, Math.floor((y / destH) * srcHeight));
    for (let x = 0; x < destW; x++) {
      const srcX = flipX
        ? Math.min(srcWidth - 1, Math.floor(((destW - 1 - x) / destW) * srcWidth))
        : Math.min(srcWidth - 1, Math.floor((x / destW) * srcWidth));
      const srcIndex = (srcY * srcWidth + srcX) * 4;
      const destIndex = ((destY + y) * destWidth + (destX + x)) * 4;
      if (destX + x >= destWidth || destY + y >= destHeight || destIndex < 0) {
        continue;
      }
      dest[destIndex] = src[srcIndex];
      dest[destIndex + 1] = src[srcIndex + 1];
      dest[destIndex + 2] = src[srcIndex + 2];
      dest[destIndex + 3] = src[srcIndex + 3];
    }
  }
}
