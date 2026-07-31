export interface ChecklistLink {
  label: string;
  url: string;
}

export interface ChecklistItem {
  id: string;
  name: string;
  links: ChecklistLink[];
}

/** Static dorm essentials list with Amazon affiliate short links. */
export const DORM_CHECKLIST: ChecklistItem[] = [
  {
    id: 'lamp',
    name: 'Lamp',
    links: [{ label: 'Shop', url: 'https://amzn.to/4c1ATHP' }],
  },
  { id: 'desk', name: 'Desk or standing?', links: [] },
  {
    id: 'command-strips',
    name: 'Command Strips',
    links: [{ label: 'Shop', url: 'https://amzn.to/4gQKEMp' }],
  },
  {
    id: 'power-strip',
    name: 'Power Strip / Extension cord',
    links: [{ label: 'Shop', url: 'https://amzn.to/4fkBEhp' }],
  },
  {
    id: 'shower-shoes',
    name: 'Shower Shoes',
    links: [{ label: 'Shop', url: 'https://amzn.to/4fl8i2p' }],
  },
  {
    id: 'towel',
    name: 'Towel',
    links: [{ label: 'Shop', url: 'https://amzn.to/4fRhV9c' }],
  },
  {
    id: 'medicine',
    name: 'Medicine',
    links: [{ label: 'Shop', url: 'https://amzn.to/3RgsYQ2' }],
  },
  {
    id: 'laundry-basket',
    name: 'Laundry Basket',
    links: [
      { label: 'Option 1', url: 'https://amzn.to/4fE6m43' },
      { label: 'Option 2', url: 'https://amzn.to/45kfRjZ' },
    ],
  },
  {
    id: 'clock',
    name: 'Clock',
    links: [{ label: 'Shop', url: 'https://amzn.to/4w8e9gR' }],
  },
  {
    id: 'storage',
    name: 'Storage',
    links: [
      { label: 'Option 1', url: 'https://amzn.to/4yGnG0P' },
      { label: 'Option 2', url: 'https://amzn.to/4vRbYhp' },
    ],
  },
  {
    id: 'hangers',
    name: 'Hangers',
    links: [{ label: 'Shop', url: 'https://amzn.to/4fn5aDm' }],
  },
  {
    id: 'cutlery',
    name: 'Cutlery / plates',
    links: [{ label: 'Shop', url: 'https://amzn.to/4c1AYv7' }],
  },
  {
    id: 'soap',
    name: 'Soap',
    links: [{ label: 'Shop', url: 'https://amzn.to/3TEkJhj' }],
  },
  {
    id: 'door-hangers',
    name: 'Door hangers',
    links: [
      { label: 'Option 1', url: 'https://amzn.to/4wWj6de' },
      { label: 'Option 2', url: 'https://amzn.to/3RUQWR1' },
    ],
  },
  {
    id: 'bed-pillow',
    name: 'Work in bed pillow',
    links: [{ label: 'Shop', url: 'https://amzn.to/3TnVhws' }],
  },
  {
    id: 'charger',
    name: '3-in-one charger',
    links: [{ label: 'Shop', url: 'https://amzn.to/4wnvoeI' }],
  },
];

export const CHECKLIST_CHECKED_KEY = 'toova-checklist-checked';

export function loadCheckedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(CHECKLIST_CHECKED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

export function saveCheckedIds(ids: Set<string>) {
  try {
    localStorage.setItem(CHECKLIST_CHECKED_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore quota / private mode */
  }
}
