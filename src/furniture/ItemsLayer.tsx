import { useStore, Item } from '../store';
import { Selectable } from './Selectable';
import { Bed } from './Bed';
import { Dresser } from './Dresser';
import { Wardrobe } from './Wardrobe';
import { Desk } from './Desk';
import { Chair } from './Chair';
import { Nightstand } from './Nightstand';
import { Lamp } from './Lamp';
import { LightSource } from './LightSource';
import { ImportedModel } from './ImportedModel';
import { HangingDecoration } from './HangingDecoration';
import { ItemEmitter } from './ItemEmitter';
import { EmitterGlow } from './EmitterGlow';

export function ItemsLayer() {
  const items = useStore((s) => s.items);
  const order = useStore((s) => s.order);
  const selectedIds = useStore((s) => s.selectedIds);
  const invalid = useStore((s) => s.invalid);
  const designerTool = useStore((s) => s.designerTool);
  const placing = designerTool === 'hanging-leaves' || designerTool === 'hanging-lights';

  return (
    <>
      {order.map((id) => {
        const item = items[id];
        if (!item) return null;
        const isSelected = selectedIds.includes(id);
        // Hanging visuals are authored in world-relative local space around item.position.
        return (
          <group
            key={id}
            position={item.position}
            rotation={[0, item.kind === 'hanging' ? 0 : item.rotationY, 0]}
            userData={{ itemId: id, hanging: item.kind === 'hanging' }}
          >
            {placing ? (
              // Still raycastable for furniture anchors, but selection is suppressed upstream.
              <ItemVisual item={item} selected={false} invalid={false} />
            ) : (
              <Selectable id={id}>
                <ItemVisual item={item} selected={isSelected} invalid={isSelected && invalid} />
              </Selectable>
            )}
          </group>
        );
      })}
    </>
  );
}

function ItemVisual({ item, selected, invalid }: { item: Item; selected: boolean; invalid: boolean }) {
  if (item.kind === 'hanging') {
    return <HangingDecoration item={item} selected={selected} invalid={invalid} />;
  }

  if (item.kind === 'light') {
    const emitter = item.emitter?.enabled !== false ? (item.emitter ?? null) : null;
    return (
      <>
        <LightSource item={item} selected={selected} invalid={invalid} />
        {emitter ? <ItemEmitter emitter={emitter} lightY={item.size[1] / 2} /> : null}
      </>
    );
  }

  const emitter = item.emitter?.enabled ? item.emitter : null;
  const body = <FurnitureBody item={item} selected={selected} invalid={invalid} />;

  return (
    <>
      {emitter ? (
        <EmitterGlow color={emitter.color} boost={emitter.emissiveBoost ?? 0.35}>
          {body}
        </EmitterGlow>
      ) : (
        body
      )}
      {emitter ? <ItemEmitter emitter={emitter} lightY={item.size[1]} /> : null}
    </>
  );
}

function FurnitureBody({ item, selected, invalid }: { item: Item; selected: boolean; invalid: boolean }) {
  switch (item.kind) {
    case 'bed': return <Bed item={item} selected={selected} invalid={invalid} />;
    case 'dresser': return <Dresser item={item} selected={selected} invalid={invalid} />;
    case 'wardrobe': return <Wardrobe item={item} selected={selected} invalid={invalid} />;
    case 'desk': return <Desk item={item} selected={selected} invalid={invalid} />;
    case 'chair': return <Chair item={item} selected={selected} invalid={invalid} />;
    case 'nightstand': return <Nightstand item={item} selected={selected} invalid={invalid} />;
    case 'lamp': return <Lamp item={item} selected={selected} invalid={invalid} />;
    case 'imported': return <ImportedModel item={item} selected={selected} invalid={invalid} />;
    case 'hanging':
    case 'light':
      return null;
  }
}
