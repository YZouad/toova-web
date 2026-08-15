const RAD2DEG = 180 / Math.PI;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export interface OrbitBaseline {
  azimuth: number;
  polar: number;
}

export interface SidebarTilt {
  tiltYDeg: number;
  tiltXDeg: number;
}

/** Map orbit delta from baseline to subtle sidebar perspective tilt (degrees). */
export function computeSidebarTilt(
  azimuth: number,
  polar: number,
  baseline: OrbitBaseline | null,
): SidebarTilt {
  const baseAz = baseline?.azimuth ?? azimuth;
  const basePol = baseline?.polar ?? polar;
  return {
    tiltYDeg: clamp((azimuth - baseAz) * RAD2DEG * 0.12, -8, 8),
    tiltXDeg: clamp((polar - basePol) * RAD2DEG * 0.08, -4, 4),
  };
}

export function applySidebarTiltToElement(
  el: HTMLElement,
  azimuth: number,
  polar: number,
  baseline: OrbitBaseline | null,
): void {
  const { tiltYDeg, tiltXDeg } = computeSidebarTilt(azimuth, polar, baseline);
  el.style.setProperty('--scene-azimuth', String(azimuth));
  el.style.setProperty('--scene-polar', String(polar));
  el.style.setProperty('--bedding-tilt-y', `${tiltYDeg.toFixed(2)}deg`);
  el.style.setProperty('--bedding-tilt-x', `${tiltXDeg.toFixed(2)}deg`);
}

export function clearSidebarTiltOnElement(el: HTMLElement): void {
  el.style.removeProperty('--scene-azimuth');
  el.style.removeProperty('--scene-polar');
  el.style.removeProperty('--bedding-tilt-y');
  el.style.removeProperty('--bedding-tilt-x');
}
