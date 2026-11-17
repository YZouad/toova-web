import { useCallback, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import {
  UCHICAGO_DORMS,
  templatesForUChicagoDorm,
  uChicagoDormLabel,
  uChicagoLayoutLabel,
} from '../lib/uchicagoDormTemplates';
import type { RoomStarterTemplate } from '../lib/roomStarterTemplates';
import { useStarterTemplatesForGoal } from '../hooks/useStarterTemplates';
import { navigate } from '../hooks/useRoute';
import { Button, DisplayHeading, Eyebrow, MonoMeta } from './kit';
import { LandingDormRoomScene } from './LandingDormRoomScene';

function spaClick(href: string) {
  return (e: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigate(href);
  };
}

interface DormSlide {
  dormId: (typeof UCHICAGO_DORMS)[number]['id'];
  dormLabel: string;
  template: RoomStarterTemplate;
}

interface LandingMeasuredDormsBandProps {
  onStartDesign: () => void;
}

export function LandingMeasuredDormsBand({ onStartDesign }: LandingMeasuredDormsBandProps) {
  const liveUchicago = useStarterTemplatesForGoal('uchicago');

  const slides = useMemo<DormSlide[]>(() => {
    const out: DormSlide[] = [];
    for (const dorm of UCHICAGO_DORMS) {
      const templates = templatesForUChicagoDorm(liveUchicago, dorm.id);
      for (const template of templates) {
        out.push({ dormId: dorm.id, dormLabel: dorm.label, template });
      }
    }
    return out;
  }, [liveUchicago]);

  const [index, setIndex] = useState(0);
  const count = slides.length;
  const slide = slides[index] ?? slides[0];
  const template = slide?.template;
  const layout = template?.dormMeta?.layout;
  const templateHref = template ? `/?template=${encodeURIComponent(template.id)}` : '/';

  const go = useCallback(
    (delta: number) => {
      if (count === 0) return;
      setIndex((i) => (i + delta + count) % count);
    },
    [count],
  );

  const jumpToDorm = useCallback(
    (dormId: (typeof UCHICAGO_DORMS)[number]['id']) => {
      const i = slides.findIndex((s) => s.dormId === dormId);
      if (i >= 0) setIndex(i);
    },
    [slides],
  );

  const openCurrent = useCallback(() => {
    if (!template) return;
    navigate(templateHref);
  }, [template, templateHref]);

  const activeDormId = slide?.dormId;
  const layoutCount = count || 15;

  return (
    <section
      className="landing-dorms-band"
      aria-labelledby="landing-dorms-band-title"
      tabIndex={0}
      onKeyDown={(e: KeyboardEvent<HTMLElement>) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          go(-1);
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          go(1);
        }
      }}
    >
      <div className="toova-frame landing-dorms-band__inner">
        <header className="landing-dorms-band__head">
          <Eyebrow level="section" className="landing-dorms-band__eyebrow">
            UChicago residence halls
          </Eyebrow>
          <div className="landing-dorms-band__title-row">
            <DisplayHeading level={4} id="landing-dorms-band-title">
              Check out our modeled UChicago dorm rooms.
            </DisplayHeading>
            <button
              type="button"
              className="landing-dorms-band__meta-link"
              onClick={() => navigate('/dorms/uchicago/')}
            >
              {`7 halls · ${layoutCount} layouts →`}
            </button>
          </div>
          <p className="landing-dorms-band__lede">
            Real measurements from Woodlawn, North, Max P, B-J, and more. Browse a layout below, then
            design your room today.
          </p>
        </header>

        <div className="landing-dorms-band__explorer" aria-live="polite">
          <div className="landing-dorms-band__toolbar">
            <div className="landing-dorms-band__halls" role="tablist" aria-label="Residence halls">
              {UCHICAGO_DORMS.map((dorm) => {
                const selected = activeDormId === dorm.id;
                return (
                  <button
                    key={dorm.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className={[
                      'landing-dorms-band__hall-btn',
                      selected ? 'landing-dorms-band__hall-btn--active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => jumpToDorm(dorm.id)}
                  >
                    {dorm.label}
                  </button>
                );
              })}
            </div>
            <div className="landing-dorms-band__clicker" aria-label="Layout carousel">
              <button
                type="button"
                className="landing-dorms-band__step"
                aria-label="Previous layout"
                onClick={() => go(-1)}
              >
                ←
              </button>
              <MonoMeta size="xs" tone="dense" upper className="landing-dorms-band__counter">
                {count ? index + 1 : 0} / {count}
              </MonoMeta>
              <button
                type="button"
                className="landing-dorms-band__step"
                aria-label="Next layout"
                onClick={() => go(1)}
              >
                →
              </button>
            </div>
          </div>

          <div className="landing-dorms-band__stage">
            {template && layout ? (
              <div className="landing-dorms-band__preview-wrap">
                <LandingDormRoomScene key={template.id} template={template} />
                <div className="landing-dorms-band__preview-meta">
                  <span className="landing-dorms-band__preview-title">
                    {uChicagoDormLabel(slide.dormId)} · {uChicagoLayoutLabel(layout)}
                  </span>
                  <span className="landing-dorms-band__preview-dims">{template.dimensionsLabel}</span>
                  <span className="landing-dorms-band__preview-cta">
                    Drag to orbit · Open below for a copy you can edit
                  </span>
                </div>
              </div>
            ) : null}

            <div className="landing-dorms-band__stage-actions">
              <Button variant="primary" size="md" onClick={openCurrent} disabled={!template}>
                Open this plan
              </Button>
              <button
                type="button"
                className="landing-dorms-band__link landing-dorms-band__link--btn"
                onClick={onStartDesign}
              >
                Or pick a hall in the designer →
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
