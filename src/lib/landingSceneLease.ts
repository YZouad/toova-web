/** Ensures only one landing-page WebGL embed owns the global layout store at a time. */

export type LandingSceneLease = 'hero' | 'dorm-carousel';

let holder: LandingSceneLease | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export function getLandingSceneLeaseHolder(): LandingSceneLease | null {
  return holder;
}

export function acquireLandingSceneLease(who: LandingSceneLease): boolean {
  if (holder && holder !== who) return false;
  const changed = holder !== who;
  holder = who;
  if (changed) notify();
  return true;
}

export function releaseLandingSceneLease(who: LandingSceneLease) {
  if (holder !== who) return;
  holder = null;
  notify();
}

export function subscribeLandingSceneLease(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
