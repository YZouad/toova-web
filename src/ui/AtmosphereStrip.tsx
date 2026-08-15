import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatTimeOfDay, isDaytime, WEATHER_OPTIONS } from '../lib/environment';
import { useStore } from '../store';
import { GlassSurface } from './GlassSurface';

const PHONE_MQ = '(max-width: 768px)';

interface AtmosphereStripProps {
  lookOpen: boolean;
  onToggleLook: () => void;
  onCloseLook: () => void;
  lookPanel?: ReactNode;
}

/**
 * Desktop: Light panel always expanded.
 * Phone: collapsed chip; expand for time, orientation, Environment, Look.
 * Environment and Look open downward as popovers under the strip.
 */
export function AtmosphereStrip({
  lookOpen,
  onToggleLook,
  onCloseLook,
  lookPanel,
}: AtmosphereStripProps) {
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const weather = useStore((s) => s.environment.weather);
  const godRays = useStore((s) => s.environment.godRays);
  const setTimeOfDay = useStore((s) => s.setTimeOfDay);
  const setOrientation = useStore((s) => s.setOrientation);
  const setWeather = useStore((s) => s.setWeather);
  const setExposure = useStore((s) => s.setExposure);
  const setGodRays = useStore((s) => s.setGodRays);

  const [envOpen, setEnvOpen] = useState(false);
  const [isPhone, setIsPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PHONE_MQ).matches,
  );
  const [expanded, setExpanded] = useState(
    () => !(typeof window !== 'undefined' && window.matchMedia(PHONE_MQ).matches),
  );
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const mq = window.matchMedia(PHONE_MQ);
    const sync = () => {
      const phone = mq.matches;
      setIsPhone(phone);
      if (!phone) setExpanded(true);
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (lookOpen) {
      setEnvOpen(false);
      setExpanded(true);
    }
  }, [lookOpen]);

  useEffect(() => {
    if (!envOpen && !(isPhone && expanded) && !lookOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setEnvOpen(false);
        if (isPhone) setExpanded(false);
        onCloseLook();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEnvOpen(false);
        if (isPhone) setExpanded(false);
        onCloseLook();
      }
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [envOpen, expanded, lookOpen, onCloseLook, isPhone]);

  const collapse = () => {
    setEnvOpen(false);
    if (isPhone) setExpanded(false);
    onCloseLook();
  };

  const showExpanded = !isPhone || expanded;

  return (
    <GlassSurface
      compact
      className={['atmosphere-strip', showExpanded ? 'atmosphere-strip--expanded' : '']
        .filter(Boolean)
        .join(' ')}
      as="aside"
    >
      <div ref={rootRef as never} className="atmosphere-strip-inner">
        <button
          type="button"
          className="atmosphere-strip-chip"
          aria-expanded={showExpanded}
          aria-controls="atmosphere-strip-panel"
          onClick={() => {
            if (expanded || lookOpen) {
              collapse();
            } else {
              onCloseLook();
              setEnvOpen(false);
              setExpanded(true);
            }
          }}
        >
          <span className="atmosphere-glyph" aria-hidden>
            {isDaytime(timeOfDay) ? '☀' : '☾'}
          </span>
          <span className="atmosphere-time">{formatTimeOfDay(timeOfDay)}</span>
          <span className="atmosphere-strip-chip-label">Light</span>
          <span className="atmosphere-strip-chip-chevron" aria-hidden>
            {showExpanded ? '▾' : '▸'}
          </span>
        </button>

        <div id="atmosphere-strip-panel" className="atmosphere-strip-panel">
          <div className="atmosphere-strip-row">
            <span className="atmosphere-glyph" aria-hidden>
              {isDaytime(timeOfDay) ? '☀' : '☾'}
            </span>
            <span className="atmosphere-time">{formatTimeOfDay(timeOfDay)}</span>
            <input
              type="range"
              className="atmosphere-slider"
              min={0}
              max={24}
              step={0.25}
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(Number(e.target.value))}
              aria-label="Time of day"
            />
          </div>

          <div className="atmosphere-strip-row">
            <span className="atmosphere-meta">N</span>
            <input
              type="range"
              className="atmosphere-slider"
              min={0}
              max={360}
              step={5}
              value={orientationDeg}
              onChange={(e) => setOrientation(Number(e.target.value))}
              aria-label="Room orientation"
            />
            <span className="atmosphere-meta atmosphere-meta--wide">{Math.round(orientationDeg)}°</span>
          </div>

          <div className="atmosphere-footer">
            <button
              type="button"
              className={`atmosphere-secondary-btn${envOpen ? ' active' : ''}`}
              aria-expanded={envOpen}
              aria-controls="environment-popover"
              onClick={() => {
                onCloseLook();
                setEnvOpen((v) => !v);
              }}
            >
              Environment
            </button>
            <button
              type="button"
              className={`atmosphere-look-btn${lookOpen ? ' active' : ''}`}
              aria-expanded={lookOpen}
              aria-controls="look-drawer"
              onClick={() => {
                setEnvOpen(false);
                setExpanded(true);
                onToggleLook();
              }}
            >
              Look
            </button>
          </div>

          {envOpen ? (
            <GlassSurface
              id="environment-popover"
              className="atmosphere-env-popover"
              as="div"
              role="dialog"
              aria-label="Environment"
            >
              <div className="atmosphere-env-inner">
                <header className="atmosphere-env-header">
                  <p className="atmosphere-env-title">Environment</p>
                  <button
                    type="button"
                    className="look-drawer-close"
                    onClick={() => setEnvOpen(false)}
                    aria-label="Close environment panel"
                  >
                    ✕
                  </button>
                </header>

                <p className="atmosphere-env-label">Weather</p>
                <div className="atmosphere-weather" role="group" aria-label="Weather">
                  {WEATHER_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`atmosphere-chip${weather === opt.id ? ' active' : ''}`}
                      title={opt.label}
                      aria-label={opt.label}
                      aria-pressed={weather === opt.id}
                      onClick={() => setWeather(opt.id)}
                    >
                      {opt.glyph}
                    </button>
                  ))}
                </div>

                <p className="atmosphere-env-label">Presets</p>
                <div className="atmosphere-presets">
                  <button
                    type="button"
                    className="atmosphere-pill"
                    onClick={() => {
                      setTimeOfDay(0);
                      setExposure(0.35);
                      setGodRays(false);
                      setWeather('clear');
                    }}
                  >
                    Midnight
                  </button>
                  <button
                    type="button"
                    className="atmosphere-pill"
                    onClick={() => {
                      setTimeOfDay(7);
                      setExposure(1);
                      setGodRays(true);
                      setWeather('partlyCloudy');
                    }}
                  >
                    Golden hour
                  </button>
                  <button
                    type="button"
                    className="atmosphere-pill"
                    onClick={() => {
                      setTimeOfDay(13);
                      setExposure(1);
                      setWeather('partlyCloudy');
                    }}
                  >
                    Noon
                  </button>
                  <button
                    type="button"
                    className="atmosphere-pill"
                    onClick={() => {
                      setTimeOfDay(11);
                      setExposure(0.65);
                      setWeather('overcast');
                    }}
                  >
                    Overcast
                  </button>
                </div>

                <button
                  type="button"
                  className={`atmosphere-toggle atmosphere-toggle--block${godRays ? ' active' : ''}`}
                  aria-pressed={godRays}
                  onClick={() => setGodRays(!godRays)}
                >
                  Light shafts
                </button>
              </div>
            </GlassSurface>
          ) : null}
        </div>

        {lookOpen && lookPanel ? (
          <div className="atmosphere-look-popover">{lookPanel}</div>
        ) : null}
      </div>
    </GlassSurface>
  );
}
