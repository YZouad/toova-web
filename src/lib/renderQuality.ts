export type RenderQualityTier = 'low' | 'balanced' | 'high' | 'presentation';

/** How much environment FX (sky shader, shafts, haze, weather) to run. */
export type EnvDetail = 'minimal' | 'standard' | 'full';

export interface RenderQualityConfig {
  tier: RenderQualityTier;
  shadowMapSize: number;
  softShadows: boolean;
  dprCap: number;
  postProcessing: boolean;
  postResolutionScale: number;
  postMultisampling: number;
  ao: boolean;
  aoIntensity: number;
  contactShadows: boolean;
  /** Legacy flag — prefer `envDetail` for new gates. */
  volumetrics: boolean;
  wallFade: boolean;
  /** Prefer visible ceiling + enclosed lighting. */
  encloseRoom: boolean;
  toneMappingExposure: number;
  /** Environment FX budget (sky / shafts / haze / weather). */
  envDetail: EnvDetail;
  /** Image-based lighting (PMREM). Expensive to build; skip on Low. */
  ibl: boolean;
  /** Window spot lights may cast shadows (extra shadow maps). */
  windowShadows: boolean;
  /** Update the sun shadow map every N frames (1 = every frame). */
  shadowUpdateEveryN: number;
  /** Use drei Shader Sky; when false, clear-color backdrop only. */
  proceduralSky: boolean;
  /** Run bloom / vignette (heavier post passes). */
  richPost: boolean;
}

const TIERS: Record<RenderQualityTier, Omit<RenderQualityConfig, 'tier'>> = {
  low: {
    shadowMapSize: 512,
    softShadows: false,
    dprCap: 1,
    postProcessing: true,
    postResolutionScale: 0.45,
    postMultisampling: 0,
    ao: false,
    aoIntensity: 0,
    contactShadows: false,
    volumetrics: false,
    wallFade: true,
    encloseRoom: true,
    toneMappingExposure: 1,
    envDetail: 'minimal',
    ibl: false,
    windowShadows: false,
    shadowUpdateEveryN: 3,
    proceduralSky: false,
    richPost: false,
  },
  balanced: {
    shadowMapSize: 1024,
    softShadows: false,
    dprCap: 1.15,
    postProcessing: true,
    postResolutionScale: 0.7,
    postMultisampling: 0,
    ao: false,
    aoIntensity: 0.3,
    contactShadows: false,
    volumetrics: false,
    wallFade: true,
    encloseRoom: true,
    toneMappingExposure: 1,
    envDetail: 'standard',
    ibl: true,
    windowShadows: false,
    shadowUpdateEveryN: 2,
    proceduralSky: true,
    richPost: false,
  },
  high: {
    shadowMapSize: 1024,
    softShadows: false,
    dprCap: 1.5,
    postProcessing: true,
    postResolutionScale: 0.92,
    postMultisampling: 0,
    ao: false,
    aoIntensity: 0.45,
    contactShadows: false,
    volumetrics: false,
    wallFade: true,
    encloseRoom: true,
    toneMappingExposure: 1,
    envDetail: 'standard',
    ibl: true,
    windowShadows: true,
    shadowUpdateEveryN: 1,
    proceduralSky: true,
    richPost: true,
  },
  presentation: {
    shadowMapSize: 1024,
    softShadows: false,
    dprCap: 1.75,
    postProcessing: true,
    postResolutionScale: 1,
    postMultisampling: 0,
    ao: true,
    aoIntensity: 0.5,
    contactShadows: false,
    volumetrics: true,
    wallFade: true,
    encloseRoom: true,
    toneMappingExposure: 1,
    envDetail: 'full',
    ibl: true,
    windowShadows: true,
    shadowUpdateEveryN: 1,
    proceduralSky: true,
    richPost: true,
  },
};

export const RENDER_QUALITY_TIERS: RenderQualityTier[] = [
  'low',
  'balanced',
  'high',
  'presentation',
];

export function resolveRenderQuality(tier: RenderQualityTier): RenderQualityConfig {
  return { tier, ...TIERS[tier] };
}

export function isRenderQualityTier(v: unknown): v is RenderQualityTier {
  return typeof v === 'string' && v in TIERS;
}

export function qualityLabel(tier: RenderQualityTier): string {
  switch (tier) {
    case 'low':
      return 'Low';
    case 'balanced':
      return 'Balanced';
    case 'high':
      return 'High';
    case 'presentation':
      return 'Presentation';
    default:
      return tier;
  }
}

const VISUAL_STORAGE_KEY = 'toova-visual-settings';

export type CameraPresetId = 'corner' | 'catalog' | 'window' | 'topDown';
export type CutawayMode = 'orbit' | 'openFront' | 'topDown';

export interface VisualSettings {
  quality: RenderQualityTier;
  cameraPreset: CameraPresetId;
  cutaway: CutawayMode;
  /**
   * Soften baked AO/emissive on imported GLBs so room lights + IBL dominate.
   * Default on — AI generators often bake lighting into textures.
   */
  relightImports: boolean;
  /** Classic 3D move / scale / yaw gizmo on the selected object. */
  advancedControls: boolean;
}

export const DEFAULT_VISUAL_SETTINGS: VisualSettings = {
  quality: 'balanced',
  cameraPreset: 'corner',
  cutaway: 'orbit',
  relightImports: true,
  advancedControls: false,
};

export function parseVisualSettings(raw: unknown): VisualSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_VISUAL_SETTINGS };
  const o = raw as Record<string, unknown>;
  return {
    quality: isRenderQualityTier(o.quality) ? o.quality : DEFAULT_VISUAL_SETTINGS.quality,
    cameraPreset:
      o.cameraPreset === 'corner' ||
      o.cameraPreset === 'catalog' ||
      o.cameraPreset === 'window' ||
      o.cameraPreset === 'topDown'
        ? o.cameraPreset
        : DEFAULT_VISUAL_SETTINGS.cameraPreset,
    cutaway:
      o.cutaway === 'orbit' || o.cutaway === 'openFront' || o.cutaway === 'topDown'
        ? o.cutaway
        : DEFAULT_VISUAL_SETTINGS.cutaway,
    relightImports:
      typeof o.relightImports === 'boolean'
        ? o.relightImports
        : DEFAULT_VISUAL_SETTINGS.relightImports,
    advancedControls:
      typeof o.advancedControls === 'boolean'
        ? o.advancedControls
        : DEFAULT_VISUAL_SETTINGS.advancedControls,
  };
}

export function loadVisualSettings(): VisualSettings {
  try {
    const raw = localStorage.getItem(VISUAL_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VISUAL_SETTINGS };
    return parseVisualSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_VISUAL_SETTINGS };
  }
}

export function saveVisualSettings(settings: VisualSettings): void {
  try {
    localStorage.setItem(VISUAL_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota / private mode */
  }
}
