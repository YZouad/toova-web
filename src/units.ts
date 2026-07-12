export const inch = 1;
export const ft = 12;

export const inches = (feet: number, inchesPart = 0) => feet * 12 + inchesPart;

export const ROOM = {
  width: inches(8, 5),    // 101"  (X)
  depth: inches(15, 0),   // 180"  (Z)
  height: 96,             // 8 ft walls
  wallThickness: 4,
} as const;

export const DOOR = {
  width: 32,
  height: 80,
  side: 'east' as const,  // +X short wall
};

export const WINDOW = {
  width: 36,
  height: 36,
  sill: 36,
  side: 'west' as const,  // -X short wall
};
