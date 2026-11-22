import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { AreaSuggestion } from '../../../lib/roomTagSuggestions';
import { areaProgress, disambiguateAreaLabels } from './showroomSignals';

export function RoomProgressStrip({
  suggestion,
  essentialLabel,
  onPlaceEssential,
  onSelectArea,
  areas,
}: {
  suggestion: AreaSuggestion | null;
  essentialLabel: (kind: AreaSuggestion['missingEssentials'][number]) => string;
  onPlaceEssential: (kind: AreaSuggestion['missingEssentials'][number]) => void;
  onSelectArea: (area: AreaSuggestion) => void;
  areas: AreaSuggestion[];
}) {
  const progress = areaProgress(suggestion);
  const labels = useMemo(() => disambiguateAreaLabels(areas), [areas]);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  if (!progress && areas.length === 0) return null;

  const activeLabel = suggestion
    ? (labels.get(suggestion.faceKey) ?? suggestion.label)
    : areas[0]
      ? (labels.get(areas[0].faceKey) ?? areas[0].label)
      : 'Room';
  const essentialWord = progress && progress.total === 1 ? 'essential' : 'essentials';

  return (
    <div className="dgl-context dgl-context--compact" ref={rootRef}>
      {areas.length > 0 ? (
        <div className="dgl-context__area-menu">
          <button
            type="button"
            className="dgl-context__area-btn"
            aria-expanded={menuOpen}
            aria-haspopup="listbox"
            aria-controls={menuId}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span>{activeLabel}</span>
            <span aria-hidden className="dgl-context__chev">
              ▾
            </span>
          </button>
          {menuOpen ? (
            <div id={menuId} className="dgl-context__menu" role="listbox" aria-label="Room areas">
              {areas.map((area) => {
                const selected = suggestion?.faceKey === area.faceKey;
                return (
                  <button
                    key={area.faceKey}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`dgl-context__menu-item${selected ? ' is-on' : ''}`}
                    onClick={() => {
                      onSelectArea(area);
                      setMenuOpen(false);
                    }}
                  >
                    {labels.get(area.faceKey) ?? area.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {progress ? (
        <>
          <span className="dgl-context__sep" aria-hidden>
            ·
          </span>
          <span className="dgl-progress__label">
            {progress.complete
              ? `${progress.total} ${essentialWord} complete`
              : `${progress.present} of ${progress.total} ${essentialWord}`}
          </span>
          {!progress.complete && progress.missing.length > 0
            ? progress.missing.slice(0, 2).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className="dg-chip dgl-context__essential"
                  onClick={() => onPlaceEssential(kind)}
                  title={`Place ${essentialLabel(kind)} in ${progress.label}`}
                >
                  + {essentialLabel(kind)}
                </button>
              ))
            : null}
        </>
      ) : null}
    </div>
  );
}
