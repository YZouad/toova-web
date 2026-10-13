import type { FloorPlan, WindowCurtains } from './floorPlanGeometry';
import type { AgenticItemAsk } from './agenticRoomPrompt';
import { CURTAIN_COLOR_SWATCHES } from './windowCurtainDefaults';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const WINDOW_CURTAIN_PRODUCT =
  /\b(blackout\s+)?curtains?\b|\bwindow\s+(?:curtains?|treatments?|drapes?|panels?)\b|\bdrapes?\b/i;

export function isWindowCurtainProductQuery(query: string): boolean {
  return WINDOW_CURTAIN_PRODUCT.test(query);
}

function normalizeHex(color: string): string | undefined {
  const c = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  return undefined;
}

/** Parse top-level agent `windowCurtains`. `null` = explicitly off; `undefined` = not set. */
export function parseAgentWindowCurtains(raw: unknown): WindowCurtains | null | undefined {
  if (raw === null) return null;
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  if (o.enabled === false) return null;
  const color =
    typeof o.color === 'string' ? normalizeHex(o.color) ?? CURTAIN_COLOR_SWATCHES[0].color : CURTAIN_COLOR_SWATCHES[0].color;
  const openness =
    typeof o.openness === 'number' && Number.isFinite(o.openness)
      ? clamp(o.openness, 0, 1)
      : 0.55;
  return { color, openness };
}

function inferCurtainColor(theme?: string): string {
  const t = (theme ?? '').toLowerCase();
  if (/\bgothic|moody|dark|navy\b/.test(t)) return CURTAIN_COLOR_SWATCHES[4].color;
  if (/\bsage|green|coastal|nature\b/.test(t)) return CURTAIN_COLOR_SWATCHES[2].color;
  if (/\bminimal|studio|neutral|modern\b/.test(t)) return CURTAIN_COLOR_SWATCHES[1].color;
  if (/\bterracotta|warm|rust|clay\b/.test(t)) return CURTAIN_COLOR_SWATCHES[3].color;
  return CURTAIN_COLOR_SWATCHES[0].color;
}

function inferOpennessFromQuery(query: string): number {
  if (/\bblackout|room\s*dark|block\s+out\b/i.test(query)) return 0.12;
  if (/\bsheer|light\s+filter|semi[- ]?sheer\b/i.test(query)) return 0.82;
  if (/\bopen|tie\s+back\b/i.test(query)) return 0.9;
  return 0.55;
}

/** When the agent lists curtain products but omits windowCurtains, infer 3D dressing from those lines. */
export function inferWindowCurtainsFromItems(
  items: AgenticItemAsk[],
  theme?: string,
): WindowCurtains | undefined {
  const curtainLines = items.filter((item) => isWindowCurtainProductQuery(item.query));
  if (curtainLines.length === 0) return undefined;
  const query = curtainLines.map((item) => item.query).join(' ');
  return {
    color: inferCurtainColor(theme),
    openness: inferOpennessFromQuery(query),
  };
}

export function resolveAgentWindowCurtains(
  list: { windowCurtains?: WindowCurtains | null; items: AgenticItemAsk[]; theme?: string },
): WindowCurtains | undefined {
  if (list.windowCurtains === null) return undefined;
  if (list.windowCurtains) return list.windowCurtains;
  return inferWindowCurtainsFromItems(list.items, list.theme);
}

export function applyWindowCurtainsToPlan(
  plan: FloorPlan,
  curtains: WindowCurtains | undefined,
): FloorPlan {
  if (!curtains) {
    return {
      ...plan,
      openings: plan.openings.map((o) =>
        o.kind === 'window' ? { ...o, curtains: undefined } : o,
      ),
    };
  }
  return {
    ...plan,
    openings: plan.openings.map((o) =>
      o.kind === 'window'
        ? {
            ...o,
            curtains: {
              color: normalizeHex(curtains.color) ?? CURTAIN_COLOR_SWATCHES[0].color,
              openness: clamp(curtains.openness, 0, 1),
            },
          }
        : o,
    ),
  };
}
