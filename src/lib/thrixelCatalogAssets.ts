import { supabase } from './supabase';

export type ThrixelCatalogStage =
  | 'architect'
  | 'edit'
  | 'autofix'
  | 'detailed'
  | 'retextured'
  | 'reduced';

export type ThrixelRevisionOp = 'edit' | 'autofix' | 'retexture' | 'detail' | 'reduce';

export interface CatalogThrixelAsset {
  kind: string;
  submissionId: string;
  stage: ThrixelCatalogStage;
  updatedAt?: string;
}

export interface CatalogThrixelAssetFetchResult {
  asset: CatalogThrixelAsset | null;
  tableMissing: boolean;
}

export const CATALOG_THRIXEL_ASSETS_MISSING_MSG =
  "Thrixel revisions aren't available yet — database update pending.";

export class CatalogThrixelAssetsMissingError extends Error {
  constructor() {
    super(CATALOG_THRIXEL_ASSETS_MISSING_MSG);
    this.name = 'CatalogThrixelAssetsMissingError';
  }
}

export function isCatalogThrixelAssetsMissingError(error: unknown): boolean {
  if (error instanceof CatalogThrixelAssetsMissingError) return true;
  if (!error || typeof error !== 'object') return false;
  const msg = 'message' in error ? String((error as { message: unknown }).message) : '';
  const code = 'code' in error ? String((error as { code: unknown }).code) : '';
  return (
    code === 'PGRST205' ||
    msg.includes('Could not find the table') ||
    msg.includes('catalog_thrixel_assets')
  );
}

export function stageAfterRevision(op: ThrixelRevisionOp): ThrixelCatalogStage {
  switch (op) {
    case 'edit':
      return 'edit';
    case 'autofix':
      return 'autofix';
    case 'retexture':
      return 'retextured';
    case 'detail':
      return 'detailed';
    case 'reduce':
      return 'reduced';
  }
}

export function canEditOrAutofix(stage: ThrixelCatalogStage): boolean {
  return stage !== 'detailed';
}

export function canDetail(stage: ThrixelCatalogStage): boolean {
  return stage !== 'detailed';
}

function mapAssetRow(data: {
  kind: unknown;
  submission_id: unknown;
  stage: unknown;
  updated_at?: unknown;
}): CatalogThrixelAsset | null {
  if (!data?.submission_id) return null;
  return {
    kind: String(data.kind),
    submissionId: String(data.submission_id),
    stage: data.stage as ThrixelCatalogStage,
    updatedAt: typeof data.updated_at === 'string' ? data.updated_at : undefined,
  };
}

export async function fetchCatalogThrixelAsset(kind: string): Promise<CatalogThrixelAssetFetchResult> {
  const { data, error } = await supabase
    .from('catalog_thrixel_assets')
    .select('kind, submission_id, stage, updated_at')
    .eq('kind', kind)
    .maybeSingle();

  if (error) {
    if (isCatalogThrixelAssetsMissingError(error)) {
      return { asset: null, tableMissing: true };
    }
    console.warn('[catalog_thrixel_assets] fetch failed', error.message);
    return { asset: null, tableMissing: false };
  }

  return { asset: data ? mapAssetRow(data) : null, tableMissing: false };
}

export async function upsertCatalogThrixelAsset(input: {
  kind: string;
  userId: string;
  submissionId: string;
  stage: ThrixelCatalogStage;
}): Promise<void> {
  const { error } = await supabase.from('catalog_thrixel_assets').upsert(
    {
      kind: input.kind,
      user_id: input.userId,
      submission_id: input.submissionId.trim(),
      stage: input.stage,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'kind' },
  );

  if (error) {
    if (isCatalogThrixelAssetsMissingError(error)) {
      throw new CatalogThrixelAssetsMissingError();
    }
    throw new Error(error.message);
  }
}

export async function linkCatalogThrixelAsset(input: {
  kind: string;
  userId: string;
  submissionId: string;
  stage: ThrixelCatalogStage;
}): Promise<{ linked: true } | { linked: false; tableMissing: true }> {
  try {
    await upsertCatalogThrixelAsset(input);
    return { linked: true };
  } catch (err) {
    if (isCatalogThrixelAssetsMissingError(err)) {
      console.warn('[catalog_thrixel_assets] link skipped — table missing');
      return { linked: false, tableMissing: true };
    }
    throw err;
  }
}
