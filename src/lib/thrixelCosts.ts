import type { ThrixelRevisionOp } from './thrixelCatalogAssets';

export interface ThrixelPricingInfo {
  flatOpCubes: {
    detailer: number;
    sculptor: number;
    texture: number;
    filter: number;
    remesh: number;
    rebake: number;
  };
  refImageCubes: number;
}

export interface ThrixelAccountInfo {
  keyName: string | null;
  role: string | null;
  plan: string | null;
  cubesBalance: number | null;
  concurrentJobCap: number | null;
  concurrentInFlight: number;
  isUnlimited: boolean;
  gpuLaneDepth: number | null;
}

export function parseThrixelPricing(raw: unknown): ThrixelPricingInfo {
  const data = raw as {
    flat_op_cubes?: Record<string, unknown>;
    ref_image_cubes?: unknown;
  };
  const flat = data.flat_op_cubes ?? {};
  const num = (v: unknown, fallback: number) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    flatOpCubes: {
      detailer: num(flat.detailer, 40),
      sculptor: num(flat.sculptor, 40),
      texture: num(flat.texture, 40),
      filter: num(flat.filter, 0),
      remesh: num(flat.remesh, 0),
      rebake: num(flat.rebake, 0),
    },
    refImageCubes: num(data.ref_image_cubes, 7),
  };
}

export function parseThrixelAccount(raw: unknown): ThrixelAccountInfo {
  const data = raw as Record<string, unknown>;
  const numOrNull = (v: unknown): number | null => {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    keyName: typeof data.keyName === 'string' ? data.keyName : null,
    role: typeof data.role === 'string' ? data.role : null,
    plan: typeof data.plan === 'string' ? data.plan : null,
    cubesBalance: numOrNull(data.cubesBalance),
    concurrentJobCap: numOrNull(data.concurrentJobCap),
    concurrentInFlight: numOrNull(data.concurrentInFlight) ?? 0,
    isUnlimited: Boolean(data.isUnlimited),
    gpuLaneDepth: numOrNull(data.gpuLaneDepth),
  };
}

export type ThrixelCostKind =
  | 'generate'
  | ThrixelRevisionOp;

export function formatCubeBalance(account: ThrixelAccountInfo | null): string | null {
  if (!account) return null;
  if (account.isUnlimited || account.cubesBalance == null) return 'Unlimited cubes';
  return `${account.cubesBalance.toLocaleString()} cube${account.cubesBalance === 1 ? '' : 's'}`;
}

export function estimateOperationCost(
  kind: ThrixelCostKind,
  pricing: ThrixelPricingInfo | null,
  opts?: { hasPrompt?: boolean },
): { label: string; flatCubes: number | null; metered: boolean } {
  const textureCost = pricing?.flatOpCubes.texture ?? 40;
  const detailCost = pricing?.flatOpCubes.detailer ?? 40;
  const refImage = pricing?.refImageCubes ?? 7;
  const withPromptExtra = opts?.hasPrompt ? refImage : 0;

  switch (kind) {
    case 'generate':
    case 'edit':
    case 'autofix':
      return {
        label: 'Metered — typically tens of cubes, charged after the run',
        flatCubes: null,
        metered: true,
      };
    case 'retexture':
      return {
        label: `${textureCost}${withPromptExtra ? ` (+ up to ${refImage} if Thrixel generates a look reference)` : ''} cubes`,
        flatCubes: textureCost + withPromptExtra,
        metered: false,
      };
    case 'detail':
      return {
        label: `${detailCost}${withPromptExtra ? ` (+ up to ${refImage} if Thrixel generates a look reference)` : ''} cubes`,
        flatCubes: detailCost + withPromptExtra,
        metered: false,
      };
    case 'reduce':
      return {
        label: 'Free',
        flatCubes: 0,
        metered: false,
      };
  }
}

export function canAffordOperation(
  account: ThrixelAccountInfo | null,
  cost: ReturnType<typeof estimateOperationCost>,
): boolean {
  if (!account) return false;
  if (account.isUnlimited || account.cubesBalance == null) return true;
  if (cost.metered) return account.cubesBalance > 0;
  return account.cubesBalance >= (cost.flatCubes ?? 0);
}

export function formatCostLine(
  account: ThrixelAccountInfo | null,
  kind: ThrixelCostKind,
  pricing: ThrixelPricingInfo | null,
  opts?: { hasPrompt?: boolean },
): string {
  const cost = estimateOperationCost(kind, pricing, opts);
  const balance = formatCubeBalance(account);
  const parts = [cost.label];
  if (balance) parts.push(`You have ${balance}.`);
  if (cost.metered && account && !account.isUnlimited && account.cubesBalance != null && account.cubesBalance <= 20) {
    parts.push('Balance is low — a complex run may fail partway.');
  }
  return parts.join(' ');
}
