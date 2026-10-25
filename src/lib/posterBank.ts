import {
  AGENTIC_POSTER_BANK,
  type AgenticPosterBankEntry,
} from './agenticPosterBankData';
import { fetchGalleryCatalog } from './galleryCatalog';
import { resolveBrowsableModelUrl, resolveCatalogThumbnailUrl } from './modelStorage';

export interface PosterBankOption {
  kind: string;
  label: string;
  modelPath: string;
  thumbnailPath: string;
  widthIn: number;
  heightIn: number;
  depthIn: number;
  tags: string[];
  /** Curated CC0 bank entry vs user-uploaded catalog model. */
  isCurated: boolean;
  signedUrl: string | null;
  previewUrl: string | null;
}

function curatedOption(entry: AgenticPosterBankEntry): PosterBankOption {
  return {
    kind: entry.kind,
    label: entry.label,
    modelPath: entry.modelPath,
    thumbnailPath: entry.thumbnailPath,
    widthIn: entry.widthIn,
    heightIn: entry.heightIn,
    depthIn: entry.depthIn,
    tags: [...entry.tags],
    isCurated: true,
    signedUrl: null,
    previewUrl: `/${entry.thumbnailPath}`,
  };
}

export function curatedPosterOptions(): PosterBankOption[] {
  return AGENTIC_POSTER_BANK.map(curatedOption);
}

/** Resolve signed model/thumbnail URLs for static checklist-refs paths. */
export async function resolvePosterOptionUrls(
  option: PosterBankOption,
): Promise<PosterBankOption> {
  if (option.signedUrl && option.previewUrl) return option;

  const isAbsolute =
    option.modelPath.startsWith('http://') || option.modelPath.startsWith('https://');

  const signedUrl = isAbsolute
    ? option.modelPath
    : await resolveBrowsableModelUrl(option.modelPath, { access: 'public' });

  let previewUrl = option.previewUrl;
  if (!previewUrl && option.thumbnailPath) {
    previewUrl =
      (await resolveCatalogThumbnailUrl(option.thumbnailPath, { access: 'public' })) ??
      (option.thumbnailPath.startsWith('http')
        ? option.thumbnailPath
        : `/${option.thumbnailPath}`);
  }

  return { ...option, signedUrl, previewUrl };
}

/** Load the signed-in user's uploaded posters tagged `poster`. */
export async function loadCustomPosterOptions(): Promise<PosterBankOption[]> {
  const { rows } = await fetchGalleryCatalog({
    source: 'mine',
    sort: 'newest',
    limit: 100,
    offset: 0,
  });

  const posterRows = rows.filter((row) => row.tags.includes('poster'));
  const options: PosterBankOption[] = [];

  for (const row of posterRows) {
    const modelPath = String(row.model_url ?? '').trim();
    if (!modelPath) continue;

    const isAbsolute =
      modelPath.startsWith('http://') || modelPath.startsWith('https://');
    const access = row.visibility === 'public' ? 'public' : 'private';
    const signedUrl = isAbsolute
      ? modelPath
      : await resolveBrowsableModelUrl(modelPath, { access });

    let previewUrl: string | null = null;
    const thumbPath = row.thumbnail_path?.trim();
    if (thumbPath) {
      previewUrl = await resolveCatalogThumbnailUrl(thumbPath, { access });
    }

    options.push({
      kind: row.kind,
      label: row.label,
      modelPath,
      thumbnailPath: thumbPath ?? '',
      widthIn: row.width_in,
      heightIn: row.height_in,
      depthIn: row.depth_in,
      tags: [...row.tags],
      isCurated: false,
      signedUrl,
      previewUrl,
    });
  }

  return options;
}

/** Curated bank plus the current user's custom poster uploads. */
export async function loadPosterBankOptions(): Promise<PosterBankOption[]> {
  const curated = curatedPosterOptions();
  let custom: PosterBankOption[] = [];
  try {
    custom = await loadCustomPosterOptions();
  } catch {
    custom = [];
  }

  const seen = new Set<string>();
  const merged: PosterBankOption[] = [];

  for (const option of [...curated, ...custom]) {
    if (seen.has(option.kind)) continue;
    seen.add(option.kind);
    merged.push(await resolvePosterOptionUrls(option));
  }

  return merged;
}
