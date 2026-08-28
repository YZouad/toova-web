import { useEffect, useMemo, useState } from 'react';
import {
  BLANK_PLAN_PRESETS,
  type BlankPlanPreset,
  type BlankPlanPresetId,
} from '../lib/roomPlanPresets';
import type { FloorPlan } from '../lib/floorPlanGeometry';
import {
  ROOM_STARTER_GOALS,
  ROOM_STARTER_TIERS,
  starterPieceCount,
  starterPreviewItems,
  starterTierLabel,
  templatesForGoal,
  type RoomStarterGoal,
  type RoomStarterTemplate,
} from '../lib/roomStarterTemplates';
import type { RoomGallerySortParam } from '../lib/galleryCatalog';
import { Button, Field, Input, Modal, Plate, Tabs } from './kit';
import { RoomGallery } from './RoomGallery';
import { RoomPreview } from './RoomPreview';

export type RoomPresetPickerSelection =
  | { kind: 'starter'; template: RoomStarterTemplate }
  | { kind: 'blank'; plan: FloorPlan; presetId: BlankPlanPresetId }
  | { kind: 'customize'; plan: FloorPlan; template?: RoomStarterTemplate }
  | { kind: 'custom' };

interface RoomPresetPickerProps {
  open?: boolean;
  /** `page` renders the form inline instead of a modal overlay. */
  variant?: 'modal' | 'page';
  creating?: boolean;
  /** Suggested name shown as the field value / placeholder when the modal opens. */
  defaultName?: string;
  cancelLabel?: string;
  onClose: () => void;
  onSelect: (selection: RoomPresetPickerSelection, name: string) => void | Promise<void>;
}

interface StarterPreview {
  template: RoomStarterTemplate;
  plan: FloorPlan;
}

interface BlankPreview {
  preset: BlankPlanPreset;
  plan: FloorPlan;
}

export function RoomPresetPicker({
  open = true,
  variant = 'modal',
  creating = false,
  defaultName = 'Room 1',
  cancelLabel = 'Cancel',
  onClose,
  onSelect,
}: RoomPresetPickerProps) {
  const isPage = variant === 'page';
  const active = isPage || open;
  const [roomName, setRoomName] = useState(defaultName);
  const [goal, setGoal] = useState<RoomStarterGoal>('bedroom');
  const [selectedStarterId, setSelectedStarterId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gallerySort, setGallerySort] = useState<RoomGallerySortParam>('hot');
  const [galleryQuery, setGalleryQuery] = useState('');

  useEffect(() => {
    if (!active) return;
    setRoomName(defaultName);
    setGoal('bedroom');
    setSelectedStarterId(null);
    setBusy(false);
    setError(null);
    setGallerySort('hot');
    setGalleryQuery('');
  }, [active, defaultName]);

  const starterPreviews = useMemo<StarterPreview[]>(
    () =>
      templatesForGoal(goal).map((template) => ({
        template,
        plan: template.buildPlan(),
      })),
    [goal],
  );

  const blankPreviews = useMemo<BlankPreview[]>(
    () => BLANK_PLAN_PRESETS.map((preset) => ({ preset, plan: preset.build() })),
    [],
  );

  const disabled = creating || busy;
  const selectedStarter = starterPreviews.find((p) => p.template.id === selectedStarterId);
  const resolvedName = roomName.trim() || defaultName;

  const runSelect = async (selection: RoomPresetPickerSelection) => {
    if (disabled) return;
    setBusy(true);
    setError(null);
    try {
      await onSelect(selection, resolvedName);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create room');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateStarter = () => {
    if (!selectedStarter) return;
    void runSelect({ kind: 'starter', template: selectedStarter.template });
  };

  const handleBlank = (preset: BlankPlanPreset) => {
    void runSelect({ kind: 'blank', plan: preset.build(), presetId: preset.id });
  };

  const handleCustomizeStarter = (template: RoomStarterTemplate) => {
    void runSelect({
      kind: 'customize',
      plan: template.buildPlan(),
      template,
    });
  };

  const handleCustomizeBlank = (preset: BlankPlanPreset) => {
    void runSelect({ kind: 'customize', plan: preset.build() });
  };

  const handleCustom = () => {
    void runSelect({ kind: 'custom' });
  };

  const handleGoalChange = (id: string) => {
    setGoal(id as RoomStarterGoal);
    setSelectedStarterId(null);
  };

  const actions = (
    <>
      <Button size="sm" variant="outline" disabled={disabled} onClick={onClose}>
        {cancelLabel}
      </Button>
      <Button
        size="sm"
        disabled={disabled || !selectedStarter}
        onClick={handleCreateStarter}
      >
        {busy || creating ? 'Creating…' : 'Create room'}
      </Button>
    </>
  );

  const form = (
    <div className="room-preset-picker">
        <div className="room-preset-section">
          <Field label="Room name">
            <Input
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder={defaultName}
              disabled={disabled}
              autoFocus
              aria-label="Room name"
            />
          </Field>
        </div>

        <div className="room-preset-section">
          <div className="room-preset-section-label">What kind of room?</div>
          <Tabs
            className="room-preset-goal-tabs"
            active={goal}
            onChange={handleGoalChange}
            tabs={ROOM_STARTER_GOALS.map((g) => ({ id: g.id, label: g.label }))}
          />
          <p className="room-preset-goal-hint">
            {ROOM_STARTER_GOALS.find((g) => g.id === goal)?.description}
          </p>
        </div>

        <div className="room-preset-section">
          <div className="room-preset-section-label">Starting look</div>
          <div className="room-preset-tier-blurb-row" aria-hidden>
            {ROOM_STARTER_TIERS.map((t) => (
              <span key={t.id} className="room-preset-tier-chip">
                <strong>{t.label}</strong> — {t.blurb}
              </span>
            ))}
          </div>
          <div className="room-preset-grid room-preset-grid--tiers" role="listbox" aria-label="Furnishing tier">
            {starterPreviews.map(({ template, plan }) => {
              const selected = selectedStarterId === template.id;
              const pieces = starterPieceCount(template);
              return (
                <div
                  key={template.id}
                  className={[
                    'kit-plate-card',
                    'kit-plate-card--interactive',
                    'room-preset-card',
                    selected ? 'room-preset-card--selected' : '',
                    disabled ? 'room-preset-card--disabled' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role="option"
                  aria-selected={selected}
                >
                  <button
                    type="button"
                    className="room-preset-card-btn"
                    disabled={disabled}
                    aria-pressed={selected}
                    aria-label={`${template.label}: ${template.description}`}
                    onClick={() => setSelectedStarterId(template.id)}
                  >
                    <Plate height={148} topCaption={`${template.tier}.plan`}>
                      <div className="app-ledger-plate-preview room-preset-preview">
                        <RoomPreview geometry={plan} items={starterPreviewItems(template)} />
                      </div>
                    </Plate>
                    <div className="kit-plate-card__caption">
                      <div className="room-preset-card-copy">
                        <div className="kit-plate-card__name">{template.label}</div>
                        <div className="kit-plate-card__author">{template.description}</div>
                      </div>
                      <span className="kit-mono-meta kit-mono-meta--sm kit-mono-meta--dense room-preset-card-dims">
                        {starterTierLabel(template.tier)} · {pieces} pcs · {template.dimensionsLabel}
                      </span>
                    </div>
                  </button>
                  <div className="room-preset-card-actions">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() => handleCustomizeStarter(template)}
                    >
                      Customize
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="room-preset-section room-preset-section--blank">
          <div className="room-preset-section-label">Blank room</div>
          <p className="room-preset-goal-hint">
            Start empty with a shape, or draw every wall yourself.
          </p>
          <div className="room-preset-grid room-preset-grid--blank" role="list">
            {blankPreviews.map(({ preset, plan }) => (
              <div
                key={preset.id}
                className={[
                  'kit-plate-card',
                  'kit-plate-card--interactive',
                  'room-preset-card',
                  'room-preset-card--blank',
                  disabled ? 'room-preset-card--disabled' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="listitem"
              >
                <button
                  type="button"
                  className="room-preset-card-btn"
                  disabled={disabled}
                  onClick={() => handleBlank(preset)}
                  aria-label={`${preset.label}: ${preset.description}`}
                >
                  <Plate height={112} topCaption={`${preset.id}.plan`}>
                    <div className="app-ledger-plate-preview room-preset-preview">
                      <RoomPreview geometry={plan} items={[]} />
                    </div>
                  </Plate>
                  <div className="kit-plate-card__caption">
                    <div className="room-preset-card-copy">
                      <div className="kit-plate-card__name">{preset.label}</div>
                      <div className="kit-plate-card__author">{preset.description}</div>
                    </div>
                    <span className="kit-mono-meta kit-mono-meta--sm kit-mono-meta--dense room-preset-card-dims">
                      {preset.dimensionsLabel}
                    </span>
                  </div>
                </button>
                <div className="room-preset-card-actions">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => handleCustomizeBlank(preset)}
                  >
                    Customize
                  </Button>
                </div>
              </div>
            ))}

            <div
              className={[
                'kit-plate-card',
                'kit-plate-card--interactive',
                'room-preset-card',
                'room-preset-card--custom',
                disabled ? 'room-preset-card--disabled' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="listitem"
            >
              <button
                type="button"
                className="room-preset-card-btn"
                disabled={disabled}
                onClick={handleCustom}
                aria-label="Customize your own floor plan"
              >
                <div className="room-preset-custom-plate" style={{ height: 112 }}>
                  <span className="room-preset-custom-glyph" aria-hidden>
                    ✎
                  </span>
                  <span className="room-preset-custom-hint">Draw walls freely</span>
                </div>
                <div className="kit-plate-card__caption">
                  <div className="room-preset-card-copy">
                    <div className="kit-plate-card__name">Customize your own</div>
                    <div className="kit-plate-card__author">
                      Start from a blank canvas and draw every wall yourself.
                    </div>
                  </div>
                  <span className="kit-mono-meta kit-mono-meta--sm kit-mono-meta--dense room-preset-card-dims">
                    Custom
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {error ? (
          <p className="room-preset-error" role="alert">
            {error}
          </p>
        ) : null}
    </div>
  );

  const gallery = (
    <div className="room-preset-section room-preset-section--gallery">
      <div className="room-preset-section-label">Looking for inspiration?</div>
      <p className="room-preset-goal-hint">
        Browse community rooms and copy a look you like.
      </p>
      <RoomGallery
        sort={gallerySort}
        query={galleryQuery}
        showSearch
        onSortChange={setGallerySort}
        onQueryChange={setGalleryQuery}
      />
    </div>
  );

  if (isPage) {
    return (
      <div className="room-preset-page-form">
        {form}
        <div className="room-preset-page-form__actions">{actions}</div>
        {gallery}
      </div>
    );
  }

  return (
    <Modal
      open={open}
      meta="New room"
      title="What are you planning?"
      onClose={disabled ? () => undefined : onClose}
      width={880}
      className="room-preset-modal"
      footer={actions}
    >
      {form}
      {gallery}
    </Modal>
  );
}
