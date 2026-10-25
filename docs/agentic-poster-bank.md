# Agentic poster bank

Curated CC0 / public-domain wall posters for the describe-your-room flow. Each entry lives in `furniture_catalog` as a built-in (`is_builtin = true`) and is matched by label, tags, and theme tokens in [`src/lib/agenticPosterMatch.ts`](../src/lib/agenticPosterMatch.ts).

## License policy

- Only **CC0**, **Public Domain Mark**, or **NASA/STScI public-domain** works.
- No trademarked characters or franchise art (no Minecraft, Harry Potter, etc.).
- Record `source_url` and `license` per row in [`agentic-poster-bank.csv`](agentic-poster-bank.csv).
- NASA imagery: credit NASA/STScI in product descriptions where applicable.

## Naming for LLM matching

Cursor and the resolver expect **descriptive, trademark-free titles**:

- Good: `Gothic cathedral architecture wall poster`, `Coastal beach shoreline wall poster`
- Bad: `gothic poster`, `Minecraft creeper poster`

When a room has a `theme`, shopping-list lines should use `{theme adjective} {subject} wall poster` so token matching hits bank labels.

## Building assets

```bash
node scripts/build-poster-bank.mjs
```

Downloads source images from Wikimedia, writes JPG thumbnails and textured GLBs under `public/checklist-refs/`, and prints SQL for catalog seeding.

## Catalog shape

- `kind`: `poster-*` slug
- `tags`: includes `poster`
- `categories`: `{decor_art}`
- `model_url`: `checklist-refs/glb/posters/<kind>.glb`
- `thumbnail_path`: `checklist-refs/images/posters/<kind>.jpg`
