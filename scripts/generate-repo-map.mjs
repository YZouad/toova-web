import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(repoRoot, 'MAP.md');

const ignoredDirectories = new Set([
  '.git',
  '.cursor',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
]);
const codeExtensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx']);
const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];

const areas = [
  ['src/ui', 'Pages, designer chrome, admin/billing UI, and design-system primitives'],
  ['src/scene', 'React Three Fiber room shell, lighting, atmosphere, and 3D overlays'],
  ['src/furniture', 'Builtin meshes, imported models, item rendering, and furniture registry'],
  ['src/interaction', 'Dragging, collision, placement, measurements, and shortcuts'],
  ['src/lib', 'Domain logic, API clients, geometry, persistence, billing, gallery, and SEO'],
  ['src/hooks', 'React orchestration for auth, routes, rooms, catalogs, and app services'],
  ['src/context', 'Cross-screen React providers and shared state scopes'],
  ['src/content', 'Typed marketing and SEO article content'],
  ['src/embed', 'iOS/webview entrypoint and native bridge'],
  ['src/legal', 'Legal document data and helpers'],
  ['src/visual', 'Standalone visual-test harnesses'],
  ['packages/room-engine', 'Shared room-engine package'],
  ['supabase/migrations', 'Database schema, RLS, RPC, and policy history'],
  ['supabase/functions', 'Deno edge functions and shared server helpers'],
  ['supabase/tests', 'Database tests'],
  ['worker', 'Cloudflare deep-link and Open Graph gateway'],
  ['worker-storage', 'Cloudflare R2 ingest and mirroring worker'],
  ['scripts', 'Build, prerender, asset, backfill, and map utilities'],
  ['docs', 'Product, integration, deployment, and operational specifications'],
  ['e2e', 'Playwright end-to-end coverage'],
];

const landmarks = [
  ['src/main.tsx', 'Browser entry; global providers and app mount'],
  ['src/App.tsx', 'Application shell and screen orchestration'],
  ['src/store.ts', 'Zustand room, item, selection, and environment state'],
  ['src/hooks/useRoute.ts', 'Custom pathname parser and navigation helpers'],
  ['src/ui/Designer.tsx', 'Primary room designer screen'],
  ['src/scene/Scene.tsx', 'Top-level R3F scene composition'],
  ['src/scene/Room.tsx', 'Room shell rendering'],
  ['src/furniture/registry.ts', 'Furniture kinds, dimensions, and metadata'],
  ['src/furniture/ItemsLayer.tsx', 'Renders placed furniture from store state'],
  ['src/interaction/collision.ts', 'Placement and collision rules'],
  ['src/lib/roomGeometry.ts', 'Room/floor-plan geometry conversion'],
  ['src/lib/supabase.ts', 'Browser Supabase client'],
  ['src/lib/trellisApi.ts', 'Trellis mesh-generation client'],
  ['src/lib/thrixelApi.ts', 'Thrixel asset-generation client'],
  ['src/lib/seo/routes.ts', 'SEO route registry used by app and prerender'],
  ['vite.config.ts', 'Build modes, CSP, and BFF development proxies'],
  ['scripts/prerender.mjs', 'Production SEO prerender'],
  ['supabase/config.toml', 'Local Supabase and edge-function configuration'],
  ['worker/src/index.ts', 'Deep links, OG metadata, and origin proxy'],
  ['worker-storage/src/index.ts', 'Supabase Storage to R2 ingest/mirroring'],
];

const taskRoutes = [
  ['App route or screen', '`src/hooks/useRoute.ts`', '`src/App.tsx`, then the target `src/ui/*Page.tsx`'],
  ['Designer UI', '`src/ui/Designer.tsx`', '`src/ui/designer/` and `src/ui/designer/mobile/`'],
  ['Room/item state', '`src/store.ts`', 'Relevant helper in `src/lib/`; avoid growing the store'],
  ['3D room rendering', '`src/scene/Scene.tsx`', '`src/scene/Room.tsx` and `src/scene/AGENTS.md`'],
  ['Furniture kind or mesh', '`src/furniture/registry.ts`', '`src/furniture/ItemsLayer.tsx` and `src/furniture/AGENTS.md`'],
  ['Drag, placement, collision', '`src/interaction/`', '`src/interaction/collision.ts` and the relevant controller'],
  ['Floor-plan geometry', '`src/lib/roomGeometry.ts`', '`src/lib/floorPlanGeometry.ts` and nearby tests'],
  ['Authentication or user session', '`src/hooks/useAuth.tsx`', '`src/lib/supabase.ts` and auth-related migrations'],
  ['Database/RLS/RPC', '`supabase/migrations/`', '`src/lib/` caller and `supabase/tests/database/`'],
  ['Edge function', '`supabase/functions/<name>/index.ts`', '`supabase/functions/_shared/` and colocated tests'],
  ['AI/mesh generation', '`src/lib/trellisApi.ts` or `src/lib/thrixelApi.ts`', '`src/lib/generationQueue.ts` and BFF contract docs'],
  ['Agentic room generation', '`src/ui/AgenticRoomFlow.tsx`', '`src/lib/agenticRoom*` and `docs/agentic-room-generation-spec.md`'],
  ['Catalog/checklist/shopping', '`src/lib/shoppingCatalog.ts`', '`src/hooks/useShoppingCatalog.ts`, contexts, and checklist UI'],
  ['Gallery, profiles, or sharing', '`src/lib/galleryCatalog.ts`', '`src/hooks/useGalleryCatalog.ts` and matching `src/ui/` page'],
  ['Billing or entitlements', '`src/hooks/useEntitlements.tsx`', '`src/ui/billing/`, billing helpers, and Supabase functions'],
  ['SEO/content', '`src/lib/seo/routes.ts`', '`src/content/`, `src/ui/SeoArticlePage.tsx`, and `scripts/prerender.mjs`'],
  ['Deep links/Open Graph', '`worker/src/index.ts`', '`src/hooks/useRoute.ts` and share/profile data helpers'],
  ['R2/public asset mirroring', '`worker-storage/src/index.ts`', '`src/lib/modelStorage.ts` and storage migrations'],
  ['iOS web embed', '`src/embed/`', '`embed.html`, Vite embed mode, and native bridge code'],
];

function walk(relativeDirectory = '') {
  const absoluteDirectory = path.join(repoRoot, relativeDirectory);
  if (!existsSync(absoluteDirectory)) return [];

  const files = [];
  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const relativePath = path.posix.join(relativeDirectory.replaceAll(path.sep, '/'), entry.name);
    if (entry.isDirectory()) files.push(...walk(relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files;
}

function filesUnder(allFiles, directory) {
  const prefix = `${directory}/`;
  return allFiles.filter((file) => file.startsWith(prefix));
}

function resolveLocalImport(importer, specifier, codeFileSet) {
  if (!specifier.startsWith('.')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier));
  const candidates = [
    base,
    ...sourceExtensions.map((extension) => `${base}${extension}`),
    ...sourceExtensions.map((extension) => `${base}/index${extension}`),
  ];
  return candidates.find((candidate) => codeFileSet.has(candidate)) ?? null;
}

function exportedSymbols(contents) {
  const symbols = new Set();
  const declaration =
    /\bexport\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
  const list = /\bexport\s*\{([^}]+)\}/g;

  for (const match of contents.matchAll(declaration)) symbols.add(match[1]);
  for (const match of contents.matchAll(list)) {
    for (const item of match[1].split(',')) {
      const symbol = item.trim().split(/\s+as\s+/)[1] ?? item.trim().split(/\s+as\s+/)[0];
      if (/^[A-Za-z_$][\w$]*$/.test(symbol)) symbols.add(symbol);
    }
  }
  if (/\bexport\s+default\b/.test(contents)) symbols.add('default');
  return [...symbols];
}

function mostImportedModules(codeFiles) {
  const codeFileSet = new Set(codeFiles);
  const inbound = new Map();
  const importPattern =
    /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()\s*['"]([^'"]+)['"]/g;

  for (const importer of codeFiles) {
    const contents = readFileSync(path.join(repoRoot, importer), 'utf8');
    for (const match of contents.matchAll(importPattern)) {
      const resolved = resolveLocalImport(importer, match[1], codeFileSet);
      if (resolved) inbound.set(resolved, (inbound.get(resolved) ?? 0) + 1);
    }
  }

  return [...inbound.entries()]
    .filter(([file, count]) => count >= 3 && !/\.(?:test|spec)\.[jt]sx?$/.test(file))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 24);
}

function assertLandmarks() {
  const missing = landmarks
    .map(([file]) => file)
    .filter((file) => !existsSync(path.join(repoRoot, file)));
  if (missing.length) throw new Error(`Map landmarks do not exist:\n${missing.join('\n')}`);
}

function markdownTable(headers, rows) {
  const header = `| ${headers.join(' | ')} |`;
  const divider = `|${headers.map(() => '---').join('|')}|`;
  return [header, divider, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
}

assertLandmarks();
const allFiles = walk().sort();
const codeFiles = allFiles.filter((file) => codeExtensions.has(path.extname(file)));
const sharedModules = mostImportedModules(codeFiles);

const areaRows = areas
  .filter(([directory]) => existsSync(path.join(repoRoot, directory)))
  .map(([directory, purpose]) => {
    const files = filesUnder(allFiles, directory);
    const code = files.filter((file) => codeExtensions.has(path.extname(file))).length;
    const tests = files.filter((file) => /\.(?:test|spec)\.[jt]sx?$|\.test\.sql$/.test(file)).length;
    return [`\`${directory}/\``, purpose, String(code), String(tests)];
  });

const sharedRows = sharedModules.map(([file, count]) => {
  const symbols = exportedSymbols(readFileSync(path.join(repoRoot, file), 'utf8'))
    .slice(0, 8)
    .map((symbol) => `\`${symbol}\``)
    .join(', ');
  return [`\`${file}\``, String(count), symbols || '—'];
});

const map = `# toova-web repository map

> Generated by \`npm run map\`. Do not hand-edit this file.

Use this as a routing index, not as a substitute for reading the target file. Start with the task route below, read the nearest \`AGENTS.md\`, then inspect only the listed files and their direct dependencies. Search this file with \`rg "<term>" MAP.md\` before scanning the repository.

## Runtime shape

\`src/main.tsx\` mounts providers → \`src/App.tsx\` selects a screen using the custom router → designer screens update \`src/store.ts\` → \`src/scene/Scene.tsx\` and \`src/furniture/ItemsLayer.tsx\` render the room. Browser data helpers call Supabase or same-origin BFF routes. Supabase edge functions own privileged server work. Cloudflare workers handle deep-link/OG delivery and public R2 mirroring.

Routing is custom; this repository does not use react-router. Trellis/Thrixel browser traffic must go through the BFF. Production SEO pages are prerendered.

## Task routes

${markdownTable(['Concern', 'Start here', 'Then inspect'], taskRoutes)}

## Landmark files

${markdownTable(
  ['Path', 'Role'],
  landmarks.map(([file, role]) => [`\`${file}\``, role]),
)}

## Area index

Counts exclude generated/build directories. Test counts are included in code counts.

${markdownTable(['Area', 'Responsibility', 'Code files', 'Tests'], areaRows)}

## Most shared local modules

These are the highest fan-in local modules, calculated from relative imports. Changes here usually have broad impact. Export names are a compact symbol index, capped at eight per file.

${markdownTable(['Module', 'Importers', 'Exports'], sharedRows)}

## Repository rules

- Root guidance: \`AGENTS.md\`
- UI guidance: \`src/ui/AGENTS.md\`
- Scene guidance: \`src/scene/AGENTS.md\`
- Furniture guidance: \`src/furniture/AGENTS.md\`
- Library guidance: \`src/lib/AGENTS.md\`
- Human setup/deploy: \`README.md\`

## Verification routes

- Type safety: \`npm run typecheck\`
- Unit tests: \`npm test\`
- Database tests: \`npm run test:db\`
- End-to-end tests: \`npm run test:e2e\`
- Web build without prerender: \`npm run build:web\`
- Full production build and prerender: \`npm run build\`
`;

writeFileSync(outputPath, map, 'utf8');
console.log(`Wrote ${path.relative(process.cwd(), outputPath)} (${statSync(outputPath).size} bytes)`);
