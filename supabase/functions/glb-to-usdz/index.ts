import {
  dataURLToBlob,
  decodeBlobToRGBA,
  installBrowserImagePolyfills,
} from "./browser_polyfill.ts";

// Remove before any three.js import so GLTFLoader picks TextureLoader, not ImageBitmapLoader.
try {
  delete (globalThis as Record<string, unknown>).createImageBitmap;
} catch {
  /* ignore */
}

const MODEL_FILES_BUCKET = "model-files";
const MAX_GLB_BYTES = 25 * 1024 * 1024;

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get: (name: string) => string | undefined;
  };
};

type ConversionRequest = {
  glb_path?: string;
  catalog_kind?: string;
  user_id?: string;
};

type CatalogRow = {
  kind: string;
  user_id: string | null;
  model_url: string | null;
  usdz_path: string | null;
};

type Caller =
  | { kind: "automation" }
  | { kind: "service" }
  | { kind: "user"; userID: string };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseURL = requireEnv("SUPABASE_URL");
    const serviceKey = requireServiceKey();

    const body = await parseBody(req);
    const catalogKind = requiredString(body.catalog_kind, "catalog_kind");
    const glbPath = requiredString(body.glb_path, "glb_path");

    if (!glbPath.toLowerCase().endsWith(".glb")) {
      return json({ error: "Only binary .glb files can be converted." }, 422);
    }

    const caller = await authorizeCaller(
      supabaseURL,
      req.headers.get("Authorization"),
      req.headers.get("apikey"),
      req.headers.get("x-automation-secret"),
      serviceKey,
    );
    const row = await loadCatalogRow(supabaseURL, serviceKey, catalogKind);

    if (row.usdz_path && row.usdz_path.length > 0) {
      return json({ usdz_path: row.usdz_path });
    }

    if (row.model_url !== glbPath) {
      return json({ error: "Catalog row does not reference the requested GLB." }, 403);
    }

    const ownerID = row.user_id ?? body.user_id;
    if (!ownerID) {
      return json({ error: "Catalog row has no owning user." }, 422);
    }

    if (caller.kind === "user") {
      if (caller.userID !== ownerID || !glbPath.startsWith(`${caller.userID}/`)) {
        return json({ error: "GLB path is not owned by the caller." }, 403);
      }
    } else if (caller.kind === "automation") {
      if (body.user_id !== ownerID || !glbPath.startsWith(`${ownerID}/`)) {
        return json({ error: "Automation payload does not match catalog ownership." }, 403);
      }
    }

    const glbBytes = await downloadGLB(supabaseURL, serviceKey, glbPath);
    if (glbBytes.byteLength > MAX_GLB_BYTES) {
      return json({ error: "GLB is too large to convert. Maximum size is 25 MB." }, 413);
    }

    const usdzBytes = await convertGLBToUSDZ(glbBytes);
    const usdzPath = `${ownerID}/${catalogKind}.usdz`;

    await uploadUSDZ(supabaseURL, serviceKey, usdzPath, usdzBytes);
    await updateCatalogUSDZPath(supabaseURL, serviceKey, catalogKind, usdzPath);

    return json({ usdz_path: usdzPath });
  } catch (error) {
    console.error(error);
    return json(
      { error: error instanceof Error ? error.message : "USDZ conversion failed." },
      500,
    );
  }
});

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function requireServiceKey(): string {
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyKey) {
    return legacyKey;
  }

  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!secretKeys) {
    throw new Error("Missing Supabase service role key.");
  }

  const parsed = JSON.parse(secretKeys) as Record<string, string>;
  const serviceKey = parsed.default ?? Object.values(parsed)[0];
  if (!serviceKey) {
    throw new Error("No Supabase secret key is available.");
  }
  return serviceKey;
}

function bearerToken(header: string | null): string | null {
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim();
}

async function parseBody(req: Request): Promise<ConversionRequest> {
  try {
    return await req.json() as ConversionRequest;
  } catch {
    throw new Error("Request body must be JSON.");
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required field: ${field}`);
  }
  return value.trim();
}

async function authorizeCaller(
  supabaseURL: string,
  authorizationHeader: string | null,
  _apiKeyHeader: string | null,
  automationSecretHeader: string | null,
  serviceKey: string,
): Promise<Caller> {
  if (automationSecretHeader) {
    const ok = await verifyAutomationSecret(
      supabaseURL,
      serviceKey,
      automationSecretHeader,
    );
    if (!ok) {
      throw new Error("Invalid automation secret.");
    }
    return { kind: "automation" };
  }

  const token = bearerToken(authorizationHeader);
  if (!token) {
    throw new Error("Missing bearer token.");
  }

  if (token === serviceKey || decodeJWTRole(token) === "service_role") {
    return { kind: "service" };
  }

  const response = await fetch(`${supabaseURL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: defaultPublishableKey() ?? serviceKey,
    },
  });
  if (!response.ok) {
    throw new Error("Invalid user token.");
  }

  const user = await response.json() as { id?: string };
  if (!user.id) {
    throw new Error("Invalid user token.");
  }

  return { kind: "user", userID: user.id };
}

async function verifyAutomationSecret(
  supabaseURL: string,
  serviceKey: string,
  secret: string,
): Promise<boolean> {
  const response = await fetch(
    `${supabaseURL}/rest/v1/rpc/verify_glb_to_usdz_automation`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_secret: secret }),
    },
  );
  if (!response.ok) {
    return false;
  }
  const result = await response.json();
  return result === true;
}

function defaultPublishableKey(): string | null {
  const legacyKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacyKey) {
    return legacyKey;
  }

  const publishableKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (!publishableKeys) {
    return null;
  }

  const parsed = JSON.parse(publishableKeys) as Record<string, string>;
  return parsed.default ?? Object.values(parsed)[0] ?? null;
}

function decodeJWTRole(token: string): string | null {
  const [, payload] = token.split(".");
  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = JSON.parse(atob(padded)) as { role?: string };
    return decoded.role ?? null;
  } catch {
    return null;
  }
}

async function loadCatalogRow(
  supabaseURL: string,
  serviceKey: string,
  catalogKind: string,
): Promise<CatalogRow> {
  const url = new URL(`${supabaseURL}/rest/v1/furniture_catalog`);
  url.searchParams.set("select", "kind,user_id,model_url,usdz_path");
  url.searchParams.set("kind", `eq.${catalogKind}`);
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: serviceHeaders(serviceKey),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }

  const rows = await response.json() as CatalogRow[];
  if (rows.length === 0) {
    throw new Error("Catalog row not found.");
  }

  return rows[0];
}

async function downloadGLB(
  supabaseURL: string,
  serviceKey: string,
  glbPath: string,
): Promise<ArrayBuffer> {
  const response = await fetch(storageObjectURL(supabaseURL, glbPath), {
    headers: serviceHeaders(serviceKey),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.arrayBuffer();
}

async function uploadUSDZ(
  supabaseURL: string,
  serviceKey: string,
  usdzPath: string,
  usdzBytes: Uint8Array,
): Promise<void> {
  const uploadBody = new ArrayBuffer(usdzBytes.byteLength);
  new Uint8Array(uploadBody).set(usdzBytes);

  const response = await fetch(storageObjectURL(supabaseURL, usdzPath), {
    method: "POST",
    headers: {
      ...serviceHeaders(serviceKey),
      "Content-Type": "model/vnd.usdz+zip",
      "x-upsert": "true",
    },
    body: new Blob([uploadBody], { type: "model/vnd.usdz+zip" }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

async function updateCatalogUSDZPath(
  supabaseURL: string,
  serviceKey: string,
  catalogKind: string,
  usdzPath: string,
): Promise<void> {
  const url = new URL(`${supabaseURL}/rest/v1/furniture_catalog`);
  url.searchParams.set("kind", `eq.${catalogKind}`);

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      ...serviceHeaders(serviceKey),
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ usdz_path: usdzPath }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

function serviceHeaders(serviceKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
  };
}

function storageObjectURL(supabaseURL: string, path: string): string {
  return `${supabaseURL}/storage/v1/object/${MODEL_FILES_BUCKET}/${encodeStoragePath(path)}`;
}

function encodeStoragePath(path: string): string {
  return path
    .split("/")
    .map((component) => encodeURIComponent(component))
    .join("/");
}

type GLTFRoot = {
  buffers?: Array<{ byteLength?: number; byteOffset?: number; uri?: string }>;
  bufferViews?: Array<{ buffer?: number; byteOffset?: number; byteLength: number }>;
  images?: Array<{ bufferView?: number; mimeType?: string; uri?: string }>;
  textures?: Array<{ source: number; sampler?: number }>;
  materials?: Array<{
    pbrMetallicRoughness?: {
      baseColorTexture?: { index: number };
      metallicRoughnessTexture?: { index: number };
    };
    normalTexture?: { index: number };
    occlusionTexture?: { index: number };
    emissiveTexture?: { index: number };
  }>;
};

type GLTFParsed = {
  scene: { traverse: (fn: (object: { isMesh?: boolean; material?: MaterialWithMaps | MaterialWithMaps[] }) => void) => void };
  parser: {
    json?: GLTFRoot;
    associations: Map<object, { materials?: number }>;
    getDependency: (type: string, index: number) => Promise<{ image?: ImageSource } | null>;
  };
};

type MaterialWithMaps = Record<string, { image?: ImageSource } | undefined>;

type ImageSource = {
  width: number;
  height: number;
  data?: Uint8ClampedArray | null;
  src?: string;
};

const MATERIAL_TEXTURE_SLOTS = [
  "map",
  "emissiveMap",
  "normalMap",
  "aoMap",
  "roughnessMap",
  "metalnessMap",
  "alphaMap",
] as const;

function parseGLBBinary(glbBytes: ArrayBuffer): { json: GLTFRoot; bin: Uint8Array } {
  const view = new DataView(glbBytes);
  if (view.getUint32(0, true) !== 0x46546c67) {
    throw new Error("Invalid GLB: bad magic.");
  }
  if (view.getUint32(4, true) !== 2) {
    throw new Error("Unsupported GLB version.");
  }

  let offset = 12;
  let json: GLTFRoot | null = null;
  let bin: Uint8Array | null = null;

  while (offset + 8 <= glbBytes.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    if (chunkType === 0x4e4f534a) {
      const chunkBytes = new Uint8Array(glbBytes, chunkStart, chunkLength);
      json = JSON.parse(new TextDecoder().decode(chunkBytes)) as GLTFRoot;
    } else if (chunkType === 0x004e4942) {
      bin = new Uint8Array(glbBytes, chunkStart, chunkLength);
    }
    offset = chunkStart + chunkLength;
  }

  if (!json || !bin) {
    throw new Error("GLB is missing JSON or BIN chunk.");
  }

  return { json, bin };
}

function readGLTFImageBytes(
  imageDef: NonNullable<GLTFRoot["images"]>[number],
  json: GLTFRoot,
  bin: Uint8Array,
): Uint8Array {
  if (imageDef.bufferView !== undefined) {
    const view = json.bufferViews?.[imageDef.bufferView];
    if (!view) {
      throw new Error(`Missing bufferView ${imageDef.bufferView}.`);
    }
    const bufferDef = json.buffers?.[view.buffer ?? 0];
    const byteOffset = (view.byteOffset ?? 0) + (bufferDef?.byteOffset ?? 0);
    return bin.subarray(byteOffset, byteOffset + view.byteLength);
  }

  if (imageDef.uri?.startsWith("data:")) {
    return new Uint8Array(0); // handled via blob path below
  }

  throw new Error("GLTF image has no bufferView or data URI.");
}

async function decodeGLTFImage(
  imageDef: NonNullable<GLTFRoot["images"]>[number],
  json: GLTFRoot,
  bin: Uint8Array,
): Promise<ImageSource> {
  const mimeType = imageDef.mimeType ?? "image/png";
  let blob: Blob;

  if (imageDef.bufferView !== undefined) {
    const bytes = readGLTFImageBytes(imageDef, json, bin);
    blob = new Blob([bytes], { type: mimeType });
  } else if (imageDef.uri?.startsWith("data:")) {
    blob = dataURLToBlob(imageDef.uri);
  } else {
    throw new Error("Unsupported GLTF image source.");
  }

  const rgba = await decodeBlobToRGBA(blob);
  return {
    width: rgba.width,
    height: rgba.height,
    data: rgba.data,
  };
}

async function repairTexturesFromGLBBinary(
  glbBytes: ArrayBuffer,
  gltf: GLTFParsed,
): Promise<void> {
  const { json, bin } = parseGLBBinary(glbBytes);
  if ((json.textures?.length ?? 0) === 0) {
    return;
  }

  const { Texture } = await import("three");
  const seenMaterials = new Set<MaterialWithMaps>();
  const repairs: Array<Promise<void>> = [];

  gltf.scene.traverse((object) => {
    if (!object.isMesh || !object.material) {
      return;
    }

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (seenMaterials.has(material)) {
        continue;
      }
      seenMaterials.add(material);

      const materialIndex = gltf.parser.associations.get(material as object)?.materials;
      if (materialIndex === undefined) {
        continue;
      }

      const matDef = json.materials?.[materialIndex];
      if (!matDef) {
        continue;
      }

      const bindings: Array<{ slot: typeof MATERIAL_TEXTURE_SLOTS[number]; textureIndex?: number }> = [
        { slot: "map", textureIndex: matDef.pbrMetallicRoughness?.baseColorTexture?.index },
        {
          slot: "roughnessMap",
          textureIndex: matDef.pbrMetallicRoughness?.metallicRoughnessTexture?.index,
        },
        {
          slot: "metalnessMap",
          textureIndex: matDef.pbrMetallicRoughness?.metallicRoughnessTexture?.index,
        },
        { slot: "normalMap", textureIndex: matDef.normalTexture?.index },
        { slot: "aoMap", textureIndex: matDef.occlusionTexture?.index },
        { slot: "emissiveMap", textureIndex: matDef.emissiveTexture?.index },
      ];

      for (const binding of bindings) {
        if (binding.textureIndex === undefined) {
          continue;
        }

        const existing = material[binding.slot] as { image?: ImageSource } | undefined;
        if (existing?.image?.data?.byteLength) {
          continue;
        }

        const texDef = json.textures?.[binding.textureIndex];
        const imageDef = texDef ? json.images?.[texDef.source] : undefined;
        if (!imageDef) {
          continue;
        }

        repairs.push((async () => {
          const image = await decodeGLTFImage(imageDef, json, bin);
          if (existing) {
            existing.image = image;
            (existing as { needsUpdate?: boolean }).needsUpdate = true;
          } else {
            const texture = new Texture(image);
            texture.flipY = false;
            material[binding.slot] = texture;
          }
        })());
      }
    }
  });

  await Promise.all(repairs);
}

function materialTexturePixelBytes(material: MaterialWithMaps): number {
  let total = 0;
  for (const slot of MATERIAL_TEXTURE_SLOTS) {
    const image = (material[slot] as { image?: ImageSource } | undefined)?.image;
    if (image?.data?.byteLength) {
      total += image.data.byteLength;
    }
  }
  return total;
}

async function hydrateTextureImagesFromParser(gltf: GLTFParsed): Promise<void> {
  const textureCount = gltf.parser.json?.textures?.length ?? 0;
  if (textureCount === 0) {
    return;
  }

  const textures = await gltf.parser.getDependencies("texture") as Array<{
    uuid?: string;
    image?: ImageSource;
  }>;
  const texturesByUuid = new Map(
    textures.filter((texture) => texture.uuid).map((texture) => [texture.uuid as string, texture]),
  );

  gltf.scene.traverse((object) => {
    if (!object.isMesh || !object.material) {
      return;
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      for (const key of MATERIAL_TEXTURE_SLOTS) {
        const texture = material[key] as { uuid?: string; image?: ImageSource } | undefined;
        if (!texture?.uuid) {
          continue;
        }
        const resolved = texturesByUuid.get(texture.uuid);
        if (resolved?.image?.data && resolved.image.width > 0 && resolved.image.height > 0) {
          texture.image = resolved.image;
        }
      }
    }
  });
}

async function convertGLBToUSDZ(glbBytes: ArrayBuffer): Promise<Uint8Array> {
  installBrowserImagePolyfills();

  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  const { USDZExporter } = await import("./USDZExporter.js");

  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(glbBytes, "") as GLTFParsed;
  await hydrateTextureImagesFromParser(gltf);
  await repairTexturesFromGLBBinary(glbBytes, gltf);

  const gltfJson = gltf.parser.json;
  if ((gltfJson?.textures?.length ?? 0) > 0) {
    let hydratedBytes = 0;
    gltf.scene.traverse((object) => {
      if (!object.isMesh || !object.material) {
        return;
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        hydratedBytes += materialTexturePixelBytes(material);
      }
    });
    if (hydratedBytes === 0) {
      throw new Error(
        `GLB has ${gltfJson.textures?.length} textures but no material texture pixels after repair.`,
      );
    }
  }

  const usdz = await new USDZExporter().parseAsync(gltf.scene);

  return usdz instanceof Uint8Array ? usdz : new Uint8Array(usdz);
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-automation-secret",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}
