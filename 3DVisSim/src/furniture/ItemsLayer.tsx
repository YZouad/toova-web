import { useStore, Item } from '../store';
import { Selectable } from './Selectable';
import { Bed } from './Bed';
import { Dresser } from './Dresser';
import { Wardrobe } from './Wardrobe';
import { Desk } from './Desk';
import { Chair } from './Chair';
import { Nightstand } from './Nightstand';
import { ImportedModel } from './ImportedModel';

export function ItemsLayer() {
  const items = useStore((s) => s.items);
  const order = useStore((s) => s.order);
  const selectedId = useStore((s) => s.selectedId);
  const invalid = useStore((s) => s.invalid);

  return (
    <>
      {order.map((id) => {
        const item = items[id];
        if (!item) return null;
        const isSelected = id === selectedId;
        return (
          <group
            key={id}
            position={item.position}
            rotation={[0, item.rotationY, 0]}
            userData={{ itemId: id }}
          >
            <Selectable id={id}>
              <FurnitureBody item={item} selected={isSelected} invalid={isSelected && invalid} />
            </Selectable>
          </group>
        );
      })}
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
    case 'imported': return <ImportedModel item={item} selected={selected} invalid={invalid} />;
  }
}
