import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { TOUR_STEPS, type TourCardPlacement, type TourTargetId } from './chromeTypes';

export interface TourCardProps {
  step: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  compact?: boolean;
  /** Designer page root — scopes target lookup. */
  rootRef?: RefObject<HTMLElement | null>;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;
const MARGIN = 16;
const GAP = 16;

function findTarget(id: TourTargetId, root: ParentNode): HTMLElement | null {
  const nodes = root.querySelectorAll(`[data-tour-id="${id}"]`);
  let best: HTMLElement | null = null;
  let bestArea = 0;
  for (const n of nodes) {
    if (!(n instanceof HTMLElement)) continue;
    const box = n.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    // Prefer the largest visible target (expanded ticker over a tiny chip).
    const area = box.width * box.height;
    if (area > bestArea) {
      best = n;
      bestArea = area;
    }
  }
  return best;
}

function measureTarget(id: TourTargetId | null, root: ParentNode | null): Rect | null {
  if (!id || !root) return null;
  const el = findTarget(id, root);
  if (!el) return null;
  const box = el.getBoundingClientRect();
  return {
    top: box.top - PAD,
    left: box.left - PAD,
    width: box.width + PAD * 2,
    height: box.height + PAD * 2,
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function overlaps(hole: Rect, top: number, left: number, cardW: number, cardH: number, pad = 10) {
  return !(
    left + cardW + pad <= hole.left ||
    hole.left + hole.width + pad <= left ||
    top + cardH + pad <= hole.top ||
    hole.top + hole.height + pad <= top
  );
}

function candidateFor(
  mode: Exclude<TourCardPlacement, 'auto' | 'center'>,
  hole: Rect,
  cardW: number,
  cardH: number,
): { top: number; left: number } {
  if (mode === 'right') {
    return {
      left: hole.left + hole.width + GAP,
      top: hole.top + hole.height / 2 - cardH / 2,
    };
  }
  if (mode === 'left') {
    return {
      left: hole.left - cardW - GAP,
      top: hole.top + hole.height / 2 - cardH / 2,
    };
  }
  if (mode === 'top') {
    return {
      top: hole.top - cardH - GAP,
      left: hole.left + hole.width / 2 - cardW / 2,
    };
  }
  return {
    top: hole.top + hole.height + GAP,
    left: hole.left + hole.width / 2 - cardW / 2,
  };
}

function resolveAutoMode(hole: Rect, viewW: number, viewH: number, compact?: boolean): Exclude<TourCardPlacement, 'auto' | 'center'> {
  // Phone: prefer vertical stacking — side placements almost always collide.
  if (compact || viewW < 720) {
    const spaceAbove = hole.top - MARGIN;
    const spaceBelow = viewH - (hole.top + hole.height) - MARGIN;
    return spaceAbove >= spaceBelow ? 'top' : 'bottom';
  }
  if (hole.top + hole.height > viewH * 0.72) return 'top';
  if (hole.left > viewW * 0.55) return 'left';
  if (hole.left + hole.width < viewW * 0.4) return 'right';
  return 'top';
}

/**
 * Place the tour card beside the spotlight without covering it.
 * Tries the preferred side first, then the remaining sides, scoring by
 * non-overlap and distance from the hole.
 */
function placeCard(
  placement: TourCardPlacement,
  hole: Rect | null,
  viewW: number,
  viewH: number,
  cardW: number,
  cardH: number,
  compact?: boolean,
): { top: number; left: number } {
  if (!hole || placement === 'center') {
    return {
      top: clamp((viewH - cardH) / 2, MARGIN, viewH - cardH - MARGIN),
      left: clamp((viewW - cardW) / 2, MARGIN, viewW - cardW - MARGIN),
    };
  }

  const preferred =
    placement === 'auto' ? resolveAutoMode(hole, viewW, viewH, compact) : placement;

  const order: Array<Exclude<TourCardPlacement, 'auto' | 'center'>> =
    compact || viewW < 720
      ? preferred === 'top'
        ? ['top', 'bottom', 'left', 'right']
        : preferred === 'bottom'
          ? ['bottom', 'top', 'left', 'right']
          : [preferred, 'top', 'bottom', 'left', 'right']
      : preferred === 'right'
        ? ['right', 'left', 'top', 'bottom']
        : preferred === 'left'
          ? ['left', 'right', 'top', 'bottom']
          : preferred === 'bottom'
            ? ['bottom', 'top', 'right', 'left']
            : ['top', 'bottom', 'right', 'left'];

  const maxTop = Math.max(MARGIN, viewH - cardH - MARGIN);
  const maxLeft = Math.max(MARGIN, viewW - cardW - MARGIN);
  const holeCx = hole.left + hole.width / 2;
  const holeCy = hole.top + hole.height / 2;

  let best: { top: number; left: number; score: number } | null = null;

  for (const mode of order) {
    const raw = candidateFor(mode, hole, cardW, cardH);
    const top = clamp(raw.top, MARGIN, maxTop);
    const left = clamp(raw.left, MARGIN, maxLeft);
    const hit = overlaps(hole, top, left, cardW, cardH);
    const dist = Math.hypot(left + cardW / 2 - holeCx, top + cardH / 2 - holeCy);
    // Prefer non-overlapping; among those, prefer earlier modes + larger distance.
    const score = (hit ? -1e6 : 1e6) - order.indexOf(mode) * 1000 + dist;
    if (!best || score > best.score) best = { top, left, score };
    // Take the first non-overlapping preferred-ish candidate.
    if (!hit && mode === preferred) break;
    if (!hit && (mode === 'top' || mode === 'bottom') && (compact || viewW < 720)) break;
  }

  if (best && best.score > 0) return { top: best.top, left: best.left };

  // Last resort: park in the largest free band (above or below the hole).
  const spaceAbove = hole.top - MARGIN;
  const spaceBelow = viewH - (hole.top + hole.height) - MARGIN;
  if (spaceBelow >= spaceAbove && spaceBelow >= cardH + GAP) {
    return {
      top: clamp(hole.top + hole.height + GAP, MARGIN, maxTop),
      left: clamp((viewW - cardW) / 2, MARGIN, maxLeft),
    };
  }
  if (spaceAbove >= cardH + GAP) {
    return {
      top: clamp(hole.top - cardH - GAP, MARGIN, maxTop),
      left: clamp((viewW - cardW) / 2, MARGIN, maxLeft),
    };
  }

  // Truly no room — center in the larger free strip even if slightly tight.
  if (spaceBelow >= spaceAbove) {
    return {
      top: clamp(hole.top + hole.height + 8, MARGIN, maxTop),
      left: clamp((viewW - cardW) / 2, MARGIN, maxLeft),
    };
  }
  return {
    top: clamp(Math.min(hole.top, maxTop) - cardH - 8, MARGIN, maxTop),
    left: clamp((viewW - cardW) / 2, MARGIN, maxLeft),
  };
}

export function TourCard({ step, onNext, onPrev, onSkip, compact, rootRef }: TourCardProps) {
  const clamped = Math.max(0, Math.min(TOUR_STEPS.length - 1, step));
  const current = TOUR_STEPS[clamped]!;
  const last = clamped >= TOUR_STEPS.length - 1;
  const targetId =
    compact && current.compactTarget !== undefined
      ? current.compactTarget
      : current.target;
  const placement =
    (compact && current.compactPlacement) || current.placement || 'auto';

  const cardRef = useRef<HTMLDivElement>(null);
  const [hole, setHole] = useState<Rect | null>(null);
  const [cardPos, setCardPos] = useState({ top: 80, left: 120 });

  useLayoutEffect(() => {
    const root = rootRef?.current ?? document.querySelector('.dg-page');
    if (!root) return;

    const update = () => {
      const nextHole = measureTarget(targetId, root);
      const viewW = window.visualViewport?.width ?? window.innerWidth;
      const viewH = window.visualViewport?.height ?? window.innerHeight;
      const cardBox = cardRef.current?.getBoundingClientRect();
      const cardW = cardBox?.width || (compact ? Math.min(360, viewW - 24) : 360);
      const cardH = cardBox?.height || 210;
      setHole(nextHole);
      setCardPos(placeCard(placement, nextHole, viewW, viewH, cardW, cardH, compact));
    };

    update();

    let scheduled = 0;
    const ro = new ResizeObserver(update);
    ro.observe(root);
    const targetEl = targetId ? findTarget(targetId, root) : null;
    if (targetEl) ro.observe(targetEl);

    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);

    // Remeasure while layout settles (ticker open, context bar mount).
    let frames = 0;
    let raf = 0;
    const tick = () => {
      update();
      if (++frames < 45) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const mo = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = requestAnimationFrame(() => {
        scheduled = 0;
        update();
      });
    });
    mo.observe(root, { childList: true, subtree: true });

    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      cancelAnimationFrame(raf);
      if (scheduled) cancelAnimationFrame(scheduled);
    };
  }, [targetId, placement, compact, rootRef, clamped]);

  return (
    <div className="dg-tour-layer" role="dialog" aria-label="Designer walkthrough">
      {hole ? (
        <div
          className="dg-tour-spotlight"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
          }}
          aria-hidden
        />
      ) : (
        <div className="dg-tour-dim" aria-hidden />
      )}

      <div
        ref={cardRef}
        className={`dg-tour${compact ? ' dg-tour--compact' : ''}`}
        style={{ top: cardPos.top, left: cardPos.left }}
      >
        <div className="dg-tour-head">
          <span className="dg-tour-head__label">
            Walkthrough · {clamped + 1} / {TOUR_STEPS.length}
          </span>
          <button type="button" className="dg-tour-head__skip" onClick={onSkip}>
            Skip
          </button>
        </div>
        <h2 className="dg-tour-title">{current.title}</h2>
        <p className="dg-tour-body">{current.body}</p>
        <div className="dg-tour-foot">
          <div className="dg-tour-dots" aria-hidden>
            {TOUR_STEPS.map((s, i) => (
              <span
                key={s.id}
                className={i === clamped ? 'is-on' : i < clamped ? 'is-done' : undefined}
              />
            ))}
          </div>
          <button
            type="button"
            className="dg-tour-btn"
            onClick={onPrev}
            disabled={clamped === 0}
            style={clamped === 0 ? { opacity: 0.4 } : undefined}
          >
            Back
          </button>
          <button type="button" className="dg-tour-btn is-primary" onClick={onNext}>
            {last ? 'Start designing' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
