import { useEffect, useMemo, useState } from 'react';
import { FURNITURE } from '../furniture/registry';
import { useAuth } from '../hooks/useAuth';
import { WALL_COLOR_SWATCHES } from '../lib/roomAppearance';
import type { MaterialPresetId } from '../lib/roomMaterials';
import { ROOM_STARTER_TEMPLATES, starterTierLabel } from '../lib/roomStarterTemplates';
import type { StarterFloorSeed, StarterHangingSeed } from '../lib/roomStarterTemplates';
import {
  floorItemKindOptions,
  getResolvedStarterTemplates,
  loadStarterTemplateOverrides,
  resetStarterTemplateOverride,
  saveStarterTemplateOverride,
  snapshotOverrideFromTemplate,
  subscribeStarterTemplates,
  type StarterFloorKind,
  type StarterTemplateOverride,
} from '../lib/starterTemplateOverrides';
import { RoomPreview } from './RoomPreview';
import { starterPreviewItems } from '../lib/roomStarterTemplates';
import {
  Banner,
  Button,
  Checkbox,
  Field,
  Input,
  MonoMeta,
  SectionOpener,
  Select,
  Spinner,
} from './kit';

const FLOOR_PRESETS: { value: MaterialPresetId; label: string }[] = [
  { value: 'lightOak', label: 'Light oak' },
  { value: 'darkOak', label: 'Dark oak' },
  { value: 'concrete', label: 'Concrete' },
  { value: 'carpet', label: 'Carpet' },
];

const KIND_OPTIONS = floorItemKindOptions();

function deg(rad: number): string {
  return String(Math.round((rad * 180) / Math.PI));
}

function rad(degStr: string): number {
  const n = Number(degStr);
  return Number.isFinite(n) ? (n * Math.PI) / 180 : 0;
}

export function AdminStartersPanel({
  onEnterRoom,
  initialSelectedId,
}: {
  onEnterRoom?: (templateId: string) => void | Promise<void>;
  initialSelectedId?: string;
}) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState(getResolvedStarterTemplates);
  const [selectedId, setSelectedId] = useState(
    initialSelectedId && ROOM_STARTER_TEMPLATES.some((t) => t.id === initialSelectedId)
      ? initialSelectedId
      : (ROOM_STARTER_TEMPLATES[0]?.id ?? ''),
  );
  const [draft, setDraft] = useState<StarterTemplateOverride>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    const unsub = subscribeStarterTemplates(setTemplates);
    void loadStarterTemplateOverrides().finally(() => setLoading(false));
    return unsub;
  }, []);

  const selected = templates.find((t) => t.id === selectedId) ?? templates[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    setDraft(snapshotOverrideFromTemplate(selected));
    setSaved(null);
    setError(null);
  }, [selected?.id, templates]);

  const builtin = ROOM_STARTER_TEMPLATES.find((t) => t.id === selected?.id);

  const previewTemplate = useMemo(() => {
    if (!selected) return null;
    return {
      ...selected,
      label: draft.label ?? selected.label,
      description: draft.description ?? selected.description,
      floorItems: draft.floorItems ?? selected.floorItems,
      hanging: draft.hanging ?? selected.hanging,
      itemSnapshots: draft.itemSnapshots ?? selected.itemSnapshots,
    };
  }, [selected, draft]);

  async function handleEnter() {
    if (!selected || !onEnterRoom) return;
    setEntering(true);
    setError(null);
    try {
      await onEnterRoom(selected.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open starter');
      setEntering(false);
    }
  }

  async function handleSave() {
    if (!selected || !user?.id) return;
    setBusy(true);
    setError(null);
    try {
      await saveStarterTemplateOverride(selected.id, draft, user.id);
      setSaved('Saved. New rooms will use this layout.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await resetStarterTemplateOverride(selected.id);
      setSaved('Reset to the built-in layout.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset');
    } finally {
      setBusy(false);
    }
  }

  function patchItem(index: number, next: StarterFloorSeed) {
    const items = [...(draft.floorItems ?? [])];
    items[index] = next;
    setDraft({ ...draft, floorItems: items });
  }

  function removeItem(index: number) {
    setDraft({ ...draft, floorItems: (draft.floorItems ?? []).filter((_, i) => i !== index) });
  }

  function addItem() {
    setDraft({
      ...draft,
      floorItems: [
        ...(draft.floorItems ?? []),
        { kind: 'chair', position: [40, 0, 40], rotationY: 0 },
      ],
    });
  }

  function patchHang(index: number, next: StarterHangingSeed) {
    const hanging = [...(draft.hanging ?? [])];
    hanging[index] = next;
    setDraft({ ...draft, hanging });
  }

  function removeHang(index: number) {
    setDraft({ ...draft, hanging: (draft.hanging ?? []).filter((_, i) => i !== index) });
  }

  if (loading) return <Spinner label="Loading starter rooms…" />;
  if (!selected || !previewTemplate) {
    return <Banner tone="error">No starter rooms found.</Banner>;
  }

  const items = draft.floorItems ?? [];
  const hanging = draft.hanging ?? [];

  return (
    <div className="admin-starters">
      <p className="admin-starters__lede">
        Open a starter in the designer to rearrange furniture in 3D. Saving there updates the
        template for new rooms; rooms already created are not rewritten.
      </p>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {saved ? <Banner tone="success">{saved}</Banner> : null}

      <div className="admin-starters__layout">
        <aside className="admin-starters__list" aria-label="Starter rooms">
          {ROOM_STARTER_TEMPLATES.map((t) => {
            const live = templates.find((x) => x.id === t.id) ?? t;
            const active = live.id === selected.id;
            return (
              <button
                key={t.id}
                type="button"
                className={`admin-starters__row${active ? ' is-active' : ''}`}
                onClick={() => setSelectedId(t.id)}
              >
                <span className="admin-starters__row-name">{live.label}</span>
                <MonoMeta size="xs" tone="dense" upper>
                  {t.goal} · {starterTierLabel(t.tier)}
                  {live.hidden ? ' · hidden' : ''}
                </MonoMeta>
              </button>
            );
          })}
        </aside>

        <div className="admin-starters__editor">
          <div className="admin-starters__preview">
            <button
              type="button"
              className="admin-starters__enter-preview"
              onClick={() => void handleEnter()}
              disabled={!onEnterRoom || entering || busy}
              aria-label={`Enter ${selected.label} in the designer`}
            >
              <RoomPreview
                geometry={previewTemplate.buildPlan()}
                items={starterPreviewItems(previewTemplate)}
              />
              <span className="admin-starters__enter-preview-label">
                {entering ? 'Opening…' : 'Click to enter and design'}
              </span>
            </button>
          </div>

          <div className="admin-starters__fields">
            <Field label="Name">
              <Input
                value={draft.label ?? ''}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </Field>
            <Field label="Description">
              <Input
                value={draft.description ?? ''}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Field>
            <Checkbox
              checked={Boolean(draft.hidden)}
              onChange={(hidden) => setDraft({ ...draft, hidden })}
              label="Hide from the new-room picker"
            />
          </div>

          <SectionOpener level={5} title="Look." style={{ margin: '18px 0 10px' }} />
          <div className="admin-starters__look">
            <Field label="Wall color">
              <div className="admin-starters__swatches">
                {WALL_COLOR_SWATCHES.map((s) => (
                  <button
                    key={s.color}
                    type="button"
                    title={s.label}
                    className={`admin-starters__swatch${draft.appearance?.wallColor === s.color ? ' is-active' : ''}`}
                    style={{ background: s.color }}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        appearance: { ...draft.appearance, wallColor: s.color },
                      })
                    }
                  />
                ))}
              </div>
            </Field>
            <Field label="Floor">
              <Select
                options={FLOOR_PRESETS}
                value={draft.appearance?.floorPreset ?? 'lightOak'}
                onChange={(floorPreset) =>
                  setDraft({
                    ...draft,
                    appearance: { ...draft.appearance, floorPreset: floorPreset as MaterialPresetId },
                  })
                }
              />
            </Field>
            <Field label="Time of day (0–24)">
              <Input
                type="number"
                min={0}
                max={24}
                step={1}
                value={String(draft.timeOfDay ?? 13)}
                onChange={(e) => setDraft({ ...draft, timeOfDay: Number(e.target.value) })}
              />
            </Field>
            <Checkbox
              checked={draft.appearance?.recessedLights !== false}
              onChange={(recessedLights) =>
                setDraft({
                  ...draft,
                  appearance: { ...draft.appearance, recessedLights },
                })
              }
              label="Recessed ceiling lights"
            />
          </div>

          <SectionOpener level={5} title="Furniture." style={{ margin: '18px 0 10px' }} />
          <MonoMeta size="xs" tone="dense" style={{ display: 'block', margin: '-4px 0 10px' }}>
            Prefer entering the room to move pieces in 3D. These fields are the same layout.
          </MonoMeta>
          <div className="admin-starters__items">
            {items.map((seed, i) => (
              <div key={`${seed.kind}-${i}`} className="admin-starters__item">
                <Select
                  options={KIND_OPTIONS}
                  value={seed.kind}
                  onChange={(kind) =>
                    patchItem(i, { ...seed, kind: kind as StarterFloorKind })
                  }
                />
                <Input
                  placeholder="Label"
                  value={seed.label ?? FURNITURE[seed.kind].label}
                  onChange={(e) => patchItem(i, { ...seed, label: e.target.value })}
                />
                <Input
                  aria-label="X inches"
                  value={String(seed.position[0])}
                  onChange={(e) =>
                    patchItem(i, {
                      ...seed,
                      position: [Number(e.target.value) || 0, seed.position[1], seed.position[2]],
                    })
                  }
                />
                <Input
                  aria-label="Y inches"
                  value={String(seed.position[1])}
                  onChange={(e) =>
                    patchItem(i, {
                      ...seed,
                      position: [seed.position[0], Number(e.target.value) || 0, seed.position[2]],
                    })
                  }
                />
                <Input
                  aria-label="Z inches"
                  value={String(seed.position[2])}
                  onChange={(e) =>
                    patchItem(i, {
                      ...seed,
                      position: [seed.position[0], seed.position[1], Number(e.target.value) || 0],
                    })
                  }
                />
                <Input
                  aria-label="Rotation degrees"
                  value={deg(seed.rotationY)}
                  onChange={(e) => patchItem(i, { ...seed, rotationY: rad(e.target.value) })}
                />
                <Button size="sm" variant="outline" onClick={() => removeItem(i)}>
                  Remove
                </Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addItem}>
              Add piece
            </Button>
          </div>
          <MonoMeta size="xs" tone="dense" style={{ display: 'block', marginTop: 8 }}>
            Position is X / Y / Z inches. Rotation is degrees. Y is height off the floor (lamps on a
            nightstand should match that surface).
          </MonoMeta>

          <SectionOpener level={5} title="Hanging décor." style={{ margin: '18px 0 10px' }} />
          <div className="admin-starters__items">
            {hanging.map((seed, i) => (
              <div key={`hang-${i}`} className="admin-starters__item admin-starters__item--hang">
                <Select
                  options={[
                    { value: 'lights', label: 'String lights' },
                    { value: 'leaves', label: 'Leaves' },
                    { value: 'led-strip', label: 'LED strip' },
                  ]}
                  value={seed.kind}
                  onChange={(kind) =>
                    patchHang(i, { ...seed, kind: kind as StarterHangingSeed['kind'] })
                  }
                />
                <Input
                  aria-label="Wall index"
                  value={String(seed.wallIndex)}
                  onChange={(e) => patchHang(i, { ...seed, wallIndex: Number(e.target.value) || 0 })}
                />
                <Input
                  aria-label="Offset start"
                  value={String(seed.offsetStart)}
                  onChange={(e) => patchHang(i, { ...seed, offsetStart: Number(e.target.value) || 0 })}
                />
                <Input
                  aria-label="Offset end"
                  value={String(seed.offsetEnd)}
                  onChange={(e) => patchHang(i, { ...seed, offsetEnd: Number(e.target.value) || 0 })}
                />
                <Input
                  aria-label="Height"
                  value={String(seed.height)}
                  onChange={(e) => patchHang(i, { ...seed, height: Number(e.target.value) || 0 })}
                />
                <Button size="sm" variant="outline" onClick={() => removeHang(i)}>
                  Remove
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setDraft({
                  ...draft,
                  hanging: [
                    ...hanging,
                    { kind: 'lights', wallIndex: 0, offsetStart: 18, offsetEnd: 72, height: 78 },
                  ],
                })
              }
            >
              Add hanging
            </Button>
          </div>

          <div className="admin-starters__actions">
            <Button
              size="sm"
              disabled={busy || entering || !onEnterRoom}
              onClick={() => void handleEnter()}
            >
              {entering ? 'Opening…' : 'Enter room'}
            </Button>
            <Button size="sm" disabled={busy || entering || !user} onClick={() => void handleSave()}>
              {busy ? 'Saving…' : 'Save starter'}
            </Button>
            <Button size="sm" variant="outline" disabled={busy || entering || !builtin} onClick={() => void handleReset()}>
              Reset to built-in
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
