import { useMemo } from 'react';
import {
  Bloom,
  BrightnessContrast,
  EffectComposer,
  HueSaturation,
  SSAO,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing';
import { ToneMappingMode, BlendFunction } from 'postprocessing';
import { colorGradingParams, grazingSunIndoor } from '../lib/environment';
import { planBounds } from '../lib/roomGeometry';
import { useStore } from '../store';
import { resolveRenderQuality } from '../lib/renderQuality';

/**
 * Always keep EffectComposer mounted for gradient sky (unmounting blanked Low).
 * Low/Balanced use a thin pass list; High/Presentation add bloom/vignette.
 */
export function ScenePostProcessing() {
  const skyMode = useStore((s) => s.environment.skyMode);
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const weather = useStore((s) => s.environment.weather);
  const exposure = useStore((s) => s.environment.exposure);
  const geom = useStore((s) => s.roomGeometry);
  const quality = useStore((s) => s.visual.quality);
  const cutaway = useStore((s) => s.visual.cutaway);
  const q = resolveRenderQuality(quality);

  const grading = useMemo(
    () => colorGradingParams(timeOfDay, orientationDeg, weather, exposure, planBounds(geom)),
    [timeOfDay, orientationDeg, weather, exposure, geom],
  );

  const aoSafe = q.ao && cutaway !== 'orbit' && !grazingSunIndoor(timeOfDay, orientationDeg);
  const showGrade = skyMode === 'gradient';
  const active = showGrade || aoSafe;
  const rich = q.richPost;
  const lite = quality === 'low';

  if (!active) return null;

  const bloomScale = quality === 'presentation' ? 0.55 : 0.65;

  return (
    <EffectComposer
      enabled
      multisampling={0}
      resolutionScale={q.postResolutionScale}
      enableNormalPass={aoSafe}
    >
      {aoSafe ? (
        <SSAO
          blendFunction={BlendFunction.MULTIPLY}
          samples={quality === 'presentation' ? 12 : 8}
          radius={6}
          intensity={q.aoIntensity * 14}
          luminanceInfluence={0.5}
          worldDistanceThreshold={120}
          worldDistanceFalloff={50}
          worldProximityThreshold={12}
          worldProximityFalloff={6}
        />
      ) : (
        <></>
      )}
      {showGrade && rich ? (
        <Bloom
          intensity={grading.bloomIntensity * bloomScale}
          luminanceThreshold={grading.bloomThreshold + 0.04}
          luminanceSmoothing={0.42}
          mipmapBlur
        />
      ) : (
        <></>
      )}
      {showGrade && !lite ? (
        <HueSaturation
          hue={grading.hue * (rich ? 0.6 : 0.4)}
          saturation={grading.saturation * (rich ? 0.7 : 0.45)}
        />
      ) : (
        <></>
      )}
      {showGrade && !lite ? (
        <BrightnessContrast
          brightness={grading.brightness * (rich ? 0.8 : 0.55)}
          contrast={grading.contrast * (rich ? 0.85 : 0.55)}
        />
      ) : (
        <></>
      )}
      {showGrade && rich ? (
        <Vignette eskil={false} offset={0.18} darkness={grading.vignetteDarkness * 0.65} />
      ) : (
        <></>
      )}
      {showGrade ? (
        <ToneMapping
          mode={ToneMappingMode.ACES_FILMIC}
          whitePoint={grading.toneExposure * (lite ? 2.6 : 3.0)}
          middleGrey={0.55}
        />
      ) : (
        <></>
      )}
    </EffectComposer>
  );
}
