import { Eyebrow, SectionOpener } from '../kit';
import { isChecklistV1AreaTag } from '../../lib/dormChecklist';
import { roomTagDef, type RoomTag } from '../../lib/roomTags';

const PICKER_TAGS: RoomTag[] = ['dorm', 'bedroom', 'kitchen'];

const PICKER_COPY: Partial<Record<RoomTag, { subtitle: string }>> = {
  dorm: {
    subtitle: 'Residence hall essentials, bedding, and shared-bath gear.',
  },
  bedroom: {
    subtitle: 'Sleep, storage, and lighting for a primary bedroom.',
  },
  kitchen: {
    subtitle: 'Cooking basics, appliances, and pantry storage.',
  },
};

interface ChecklistRoomTypePickerProps {
  onSelect: (tag: RoomTag | null) => void;
}

export function ChecklistRoomTypePicker({ onSelect }: ChecklistRoomTypePickerProps) {
  return (
    <div className="checklist-room-picker">
      <Eyebrow level="page">Toova checklist</Eyebrow>
      <SectionOpener
        level={3}
        title="What kind of space are you furnishing?"
        note="Pick one to browse"
      />
      <p className="checklist-room-picker__lede">
        We will walk you through curated picks, why each category matters, and product options you
        can save to any checklist.
      </p>
      <div className="checklist-room-picker__grid" role="list">
        {PICKER_TAGS.filter(isChecklistV1AreaTag).map((tag) => {
          const def = roomTagDef(tag);
          const copy = PICKER_COPY[tag];
          return (
            <button
              key={tag}
              type="button"
              className="checklist-room-picker__card"
              onClick={() => onSelect(tag)}
            >
              <span className="checklist-room-picker__title">{def.label}</span>
              <span className="checklist-room-picker__subtitle">{copy?.subtitle ?? def.label}</span>
              <span className="checklist-room-picker__cta">Start guide →</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
