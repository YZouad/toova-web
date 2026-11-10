import React from 'react';

interface ChecklistRoomTypePickerProps {
  onSelect: (type: 'kitchen' | 'bathroom' | 'kids' | 'other' | 'bedroom' | 'living_room' | 'dining' | 'office' | 'closet' | 'laundry' | 'entry' | 'hallway' | 'dorm' | null) => void;
}

export function ChecklistRoomTypePicker({ onSelect }: ChecklistRoomTypePickerProps) {
  const roomTypes: Array<'dorm' | 'bedroom' | 'living_room'> = ['dorm', 'bedroom', 'living_room'];
  
  return (
    <div className="checklist-room-type-picker">
      {roomTypes.map(type => (
        <button
          key={type}
          className="checklist-room-type-picker__option"
          onClick={() => onSelect(type)}
        >
          {type}
        </button>
      ))}
    </div>
  );
}
