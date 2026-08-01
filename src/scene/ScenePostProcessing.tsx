import { useMemo } from 'react';
import {
  Bloom,
  BrightnessContrast,
  EffectComposer,
  HueSaturation,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { colorGradingParams } from '../lib/environment';
import { planBounds } from '../lib/roomGeometry';
import { useStore } from '../store';

export function ScenePostProcessing() {
  const skyMode = useStore((s) => s.environment.skyMode);
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const weather = useStore((s) => s.environment.weather);
  const exposure = useStore((s) => s.environment.exposure);
  const geom = useStore((s) => s.roomGeometry);

  const grading = useMemo(
    () => colorGradingParams(timeOfDay, orientationDeg, weather, exposure, planBounds(geom)),
    [timeOfDay, orientationDeg, weather, exposure, geom],
  );

  if (skyMode !== 'gradient') return null;

  return (
    <EffectComposer multisampling={0} resolutionScale={0.92}>
      <Bloom
        intensity={grading.bloomIntensity}
        luminanceThreshold={grading.bloomThreshold}
        luminanceSmoothing={0.42}
        mipmapBlur
      />
      <HueSaturation hue={grading.hue} saturation={grading.saturation} />
      <BrightnessContrast brightness={grading.brightness} contrast={grading.contrast} />
      <Vignette eskil={false} offset={0.12} darkness={grading.vignetteDarkness} />
      <ToneMapping
        mode={ToneMappingMode.ACES_FILMIC}
        whitePoint={grading.toneExposure * 3.2}
        middleGrey={0.52}
      />
    </EffectComposer>
  );
}
