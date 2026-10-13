import type { RoomAppearance } from './roomAppearance';
import { DEFAULT_APPEARANCE } from './roomAppearance';
import {
  resolveAgenticThemeProfile,
  type AgenticThemeProfile,
} from './agenticThemeProfile';
import type { AgenticVibeFurnishings } from './agenticRoomVibe';

const HEX = /^#[0-9a-f]{6}$/i;

export function normalizeHexColor(raw: string): string | null {
  const t = raw.trim();
  if (HEX.test(t)) return t.toLowerCase();
  const short = t.match(/^#?([0-9a-f]{3})$/i);
  if (short) {
    const [r, g, b] = short[1]!.split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

/** Parse comma/space-separated hex list or JSON string array. */
export function parseColorSchemeInput(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((v) => (typeof v === 'string' ? normalizeHexColor(v) : null))
          .filter((c): c is string => !!c);
      }
    } catch {
      /* fall through */
    }
  }
  return trimmed
    .split(/[,|\n]+/)
    .map((part) => normalizeHexColor(part))
    .filter((c): c is string => !!c);
}

export function parseAgentColorScheme(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const colors = raw
    .map((v) => (typeof v === 'string' ? normalizeHexColor(v) : null))
    .filter((c): c is string => !!c);
  return colors.length ? colors : undefined;
}

function luminance(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function pickByRole(colors: string[], role: 'light' | 'dark' | 'mid'): string {
  const sorted = [...colors].sort((a, b) => luminance(a) - luminance(b));
  if (role === 'light') return sorted[sorted.length - 1] ?? colors[0]!;
  if (role === 'dark') return sorted[0] ?? colors[0]!;
  return sorted[Math.floor(sorted.length / 2)] ?? colors[0]!;
}

export function furnishingsFromColorScheme(
  colors: string[],
  fallback: AgenticVibeFurnishings,
): AgenticVibeFurnishings {
  if (colors.length === 0) return fallback;
  const wood = colors[1] ?? pickByRole(colors, 'mid');
  const accent = colors[2] ?? pickByRole(colors, 'dark');
  const top = colors[3] ?? pickByRole(colors, 'light');
  const lamp = colors[colors.length - 1] ?? accent;
  return {
    woodTint: wood,
    shelfTint: wood,
    chairTint: accent,
    bedFrameTint: wood,
    mattressColor: pickByRole(colors, 'light'),
    blanketColor: accent,
    topColor: top,
    rugTint: pickByRole(colors, 'mid'),
    lampColor: lamp,
  };
}

export function appearanceFromColorScheme(
  colors: string[],
  base: RoomAppearance,
): Partial<RoomAppearance> {
  if (colors.length === 0) return {};
  return {
    wallColor: colors[0] ?? base.wallColor,
    ...(colors.length > 1 ? {} : {}),
  };
}

export function curtainColorFromScheme(colors: string[] | undefined): string | undefined {
  if (!colors?.length) return undefined;
  return colors[1] ?? colors[0];
}

export function mergeAppearanceWithColorScheme(
  base: RoomAppearance,
  colors: string[] | undefined,
): RoomAppearance {
  if (!colors?.length) return base;
  return {
    ...base,
    wallColor: colors[0] ?? base.wallColor,
  };
}

export const DEFAULT_COLOR_SCHEME_PLACEHOLDER = '#d8c4ad, #8a6440, #5c6166';

/** Default palette when the user turns on custom colors (wall, wood, accent, top, lamp). */
export const DEFAULT_AGENTIC_SCHEME_COLORS = [
  '#d8d0c2',
  '#8a6440',
  '#b89b7a',
  '#e8d8b0',
  '#ffd090',
] as const;

export type AgenticSchemeRoleId = 'wall' | 'wood' | 'accent' | 'top' | 'lamp';

export interface AgenticSchemeRole {
  id: AgenticSchemeRoleId;
  label: string;
  hint: string;
  optional?: boolean;
}

export const AGENTIC_SCHEME_ROLES: AgenticSchemeRole[] = [
  { id: 'wall', label: 'Walls', hint: 'Paint on every wall' },
  { id: 'wood', label: 'Wood & furniture', hint: 'Desks, beds, shelves' },
  { id: 'accent', label: 'Textiles & accent', hint: 'Bedding, chair fabric, rug' },
  { id: 'top', label: 'Desk tops', hint: 'Optional desktop surface', optional: true },
  { id: 'lamp', label: 'Lamp glow', hint: 'Optional warm light color', optional: true },
];

const ROLE_INDEX: Record<AgenticSchemeRoleId, number> = {
  wall: 0,
  wood: 1,
  accent: 2,
  top: 3,
  lamp: 4,
};

/** Pad with defaults so every required role has a color. */
export function ensureAgenticSchemeColors(colors: string[] | undefined, minSlots = 3): string[] {
  const next = [...(colors ?? [])];
  while (next.length < minSlots) {
    next.push(DEFAULT_AGENTIC_SCHEME_COLORS[next.length] ?? DEFAULT_AGENTIC_SCHEME_COLORS[2]!);
  }
  return next.map((c) => normalizeHexColor(c) ?? DEFAULT_AGENTIC_SCHEME_COLORS[0]!);
}

export function activeAgenticSchemeRoles(colors: string[] | undefined): AgenticSchemeRole[] {
  const len = Math.max(3, colors?.length ?? 0);
  return AGENTIC_SCHEME_ROLES.filter((role) => {
    if (!role.optional) return true;
    return len > ROLE_INDEX[role.id];
  });
}

export function setAgenticSchemeColor(
  colors: string[] | undefined,
  role: AgenticSchemeRoleId,
  hex: string,
): string[] {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return colors ?? [];
  const index = ROLE_INDEX[role];
  const next = ensureAgenticSchemeColors(colors, Math.max(3, index + 1));
  next[index] = normalized;
  return next;
}

export function addOptionalAgenticSchemeRole(
  colors: string[] | undefined,
  role: AgenticSchemeRoleId,
): string[] {
  const index = ROLE_INDEX[role];
  const next = ensureAgenticSchemeColors(colors, 3);
  while (next.length <= index) {
    next.push(DEFAULT_AGENTIC_SCHEME_COLORS[next.length] ?? DEFAULT_AGENTIC_SCHEME_COLORS[2]!);
  }
  return next;
}

export function removeOptionalAgenticSchemeRoles(colors: string[]): string[] {
  return colors.slice(0, 3);
}

export function colorForAgenticInput(hex: string, fallback: string): string {
  const n = normalizeHexColor(hex);
  return n && n.length === 7 ? n : fallback;
}

/** Map a resolved theme profile to the agentic color-scheme slot order. */
export function colorSchemeFromThemeProfile(profile: AgenticThemeProfile): string[] {
  const { appearance, furnishings } = profile;
  return [
    appearance.wallColor,
    furnishings.woodTint,
    furnishings.blanketColor,
    furnishings.topColor,
    furnishings.lampColor,
  ].map((c) => normalizeHexColor(c) ?? c.toLowerCase());
}

/** Infer palette from theme field + prompt (e.g. ocean → coastal blues). */
export function inferColorSchemeFromTheme(
  theme?: string | null,
  prompt?: string | null,
): string[] | undefined {
  const profile = resolveAgenticThemeProfile(theme, prompt);
  if (!profile) return undefined;
  return colorSchemeFromThemeProfile(profile);
}
