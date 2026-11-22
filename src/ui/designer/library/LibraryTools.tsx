import type { AreaSuggestion } from '../../../lib/roomTagSuggestions';
import type { HangingDecorKind } from '../../../store';
import {
  IconFreeLight,
  IconHangingLeaves,
  IconHangingLights,
  IconLedStrip,
  IconMeasure,
} from '../icons';

export interface LibraryToolsProps {
  onStartDraw: (kind: HangingDecorKind) => void;
  onStartMeasure: () => void;
  onAddLight: () => void;
  activeSuggestion: AreaSuggestion | null;
  suggestionAreas: AreaSuggestion[];
  onSelectArea: (area: AreaSuggestion) => void;
  onPlaceEssential: (kind: AreaSuggestion['missingEssentials'][number]) => void;
  essentialLabel: (kind: AreaSuggestion['missingEssentials'][number]) => string;
  /** Hide room suggestions (e.g. showroom puts categories in the header). */
  hideSuggestions?: boolean;
  /** Compact horizontal row for the tray variant. */
  layout?: 'rail' | 'row';
}

function DrawButton(props: {
  label: string;
  aria: string;
  meta: string;
  color: string;
  Icon: typeof IconHangingLights;
  run: () => void;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      className={`dg-draw-btn${props.wide ? ' dg-draw-btn--wide' : ''}`}
      aria-label={props.aria}
      title={props.meta}
      onClick={props.run}
    >
      <span className="dg-draw-btn__dot" style={{ background: props.color }}>
        <props.Icon size={11} stroke="currentColor" />
      </span>
      <span className="dg-draw-btn__label">{props.label}</span>
    </button>
  );
}

export function LibraryDrawTools({
  onStartDraw,
  onStartMeasure,
  onAddLight,
  layout = 'rail',
}: Pick<LibraryToolsProps, 'onStartDraw' | 'onStartMeasure' | 'onAddLight' | 'layout'>) {
  return (
    <div className={`dgl-draw${layout === 'row' ? ' dgl-draw--row' : ''}`}>
      <span className="dgl-eyebrow">Draw it in the room</span>
      <div className={layout === 'row' ? 'dg-chip-row' : 'dg-draw-grid'}>
        <DrawButton
          label="Fairy lights"
          aria="Draw fairy lights"
          meta="draped path"
          color="#E8C27A"
          Icon={IconHangingLights}
          run={() => onStartDraw('lights')}
        />
        <DrawButton
          label="Leaves"
          aria="Draw hanging leaves"
          meta="draped path"
          color="#7E8A60"
          Icon={IconHangingLeaves}
          run={() => onStartDraw('leaves')}
        />
        <DrawButton
          label="LED strip"
          aria="Draw LED strip"
          meta="straight runs between points"
          color="#6EB5FF"
          Icon={IconLedStrip}
          run={() => onStartDraw('led-strip')}
        />
        <DrawButton
          label="Free light"
          aria="Place a free light"
          meta="drops in, then lift"
          color="#F0DCA8"
          Icon={IconFreeLight}
          run={onAddLight}
        />
        <DrawButton
          label="Measure in the room"
          aria="Measure in the room"
          meta="click two points"
          color="#E8C27A"
          Icon={IconMeasure}
          run={onStartMeasure}
          wide={layout === 'rail'}
        />
      </div>
    </div>
  );
}

export function LibrarySuggestions({
  activeSuggestion,
  suggestionAreas,
  onSelectArea,
  onPlaceEssential,
  essentialLabel,
}: Pick<
  LibraryToolsProps,
  | 'activeSuggestion'
  | 'suggestionAreas'
  | 'onSelectArea'
  | 'onPlaceEssential'
  | 'essentialLabel'
>) {
  if (suggestionAreas.length === 0) return null;
  return (
    <div className="dgl-suggestions">
      <span className="dgl-eyebrow">
        Suggested for {activeSuggestion?.label ?? 'area'}
      </span>
      <div className="dg-chip-row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {suggestionAreas.map((area) => (
          <button
            key={area.faceKey}
            type="button"
            className={`dg-chip${activeSuggestion?.faceKey === area.faceKey ? ' is-accent' : ''}`}
            onClick={() => onSelectArea(area)}
          >
            {area.label}
          </button>
        ))}
      </div>
      {activeSuggestion && activeSuggestion.missingEssentials.length > 0 ? (
        <div className="dgl-essentials">
          <span className="dgl-muted">Missing essentials</span>
          <div className="dg-chip-row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {activeSuggestion.missingEssentials.map((kind) => (
              <button
                key={kind}
                type="button"
                className="dg-chip"
                onClick={() => onPlaceEssential(kind)}
                title={`Place ${essentialLabel(kind)} in ${activeSuggestion.label}`}
              >
                + {essentialLabel(kind)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {activeSuggestion ? (
        <button
          type="button"
          className="dg-footer-btn"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => onSelectArea(activeSuggestion)}
        >
          Show {activeSuggestion.label} picks
        </button>
      ) : null}
    </div>
  );
}

export function LibraryTools(props: LibraryToolsProps) {
  return (
    <div className={`dgl-tools${props.layout === 'row' ? ' dgl-tools--row' : ''}`}>
      <LibraryDrawTools
        onStartDraw={props.onStartDraw}
        onStartMeasure={props.onStartMeasure}
        onAddLight={props.onAddLight}
        layout={props.layout}
      />
      {props.hideSuggestions ? null : (
        <LibrarySuggestions
          activeSuggestion={props.activeSuggestion}
          suggestionAreas={props.suggestionAreas}
          onSelectArea={props.onSelectArea}
          onPlaceEssential={props.onPlaceEssential}
          essentialLabel={props.essentialLabel}
        />
      )}
    </div>
  );
}
