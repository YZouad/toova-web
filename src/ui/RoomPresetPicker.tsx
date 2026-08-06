import { useMemo, useState } from 'react';
import {
  type RoomPlanPreset,
  type RoomPlanPresetId,
  ROOM_PLAN_PRESETS,
} from '../lib/roomPlanPresets';
import type { FloorPlan } from '../lib/floorPlanGeometry';
import { Modal, Plate } from './kit';
import { RoomPreview } from './RoomPreview';

interface RoomPresetPickerProps {
  open: boolean;
  creating?: boolean;
  onClose: () => void;
  onSelectPreset: (plan: FloorPlan, presetId: RoomPlanPresetId) => void | Promise<void>;
  onCustomize: () => void;
}

interface PresetPreview {
  preset: RoomPlanPreset;
  plan: FloorPlan;
}

export function RoomPresetPicker({
  open,
  creating = false,
  onClose,
  onSelectPreset,
  onCustomize,
}: RoomPresetPickerProps) {
  const [busyId, setBusyId] = useState<RoomPlanPresetId | 'custom' | null>(null);
  const previews = useMemo<PresetPreview[]>(
    () => ROOM_PLAN_PRESETS.map((preset) => ({ preset, plan: preset.build() })),
    [],
  );
  const disabled = creating || busyId !== null;

  const handlePreset = async (preset: RoomPlanPreset) => {
    if (disabled) return;
    setBusyId(preset.id);
    try {
      await onSelectPreset(preset.build(), preset.id);
    } finally {
      setBusyId(null);
    }
  };

  const handleCustom = () => {
    if (disabled) return;
    setBusyId('custom');
    onCustomize();
  };

  return (
    <Modal
      open={open}
      meta="New room"
      title="Choose a starting layout"
      onClose={disabled ? () => undefined : onClose}
      width={820}
      className="room-preset-modal"
    >
      <div className="room-preset-grid" role="list">
        {previews.map(({ preset, plan }) => {
          const isBusy = busyId === preset.id;
          return (
            <div
              key={preset.id}
              className={[
                'kit-plate-card',
                'kit-plate-card--interactive',
                'room-preset-card',
                disabled && !isBusy ? 'room-preset-card--disabled' : '',
                isBusy ? 'room-preset-card--busy' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="listitem"
            >
              <button
                type="button"
                className="room-preset-card-btn"
                disabled={disabled}
                onClick={() => void handlePreset(preset)}
                aria-label={`${preset.label}: ${preset.description}`}
              >
                <Plate height={148} topCaption={`${preset.id}.plan`}>
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
                    {isBusy ? 'Creating…' : preset.dimensionsLabel}
                  </span>
                </div>
              </button>
            </div>
          );
        })}

        <div
          className={[
            'kit-plate-card',
            'kit-plate-card--interactive',
            'room-preset-card',
            'room-preset-card--custom',
            disabled && busyId !== 'custom' ? 'room-preset-card--disabled' : '',
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
            <div className="room-preset-custom-plate" style={{ height: 148 }}>
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
    </Modal>
  );
}
