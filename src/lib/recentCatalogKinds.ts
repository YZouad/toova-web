const RECENT_KINDS_KEY = 'toova-recent-kinds';
const RECENT_COMMANDS_KEY = 'toova-recent-commands';
const RECENT_QUERIES_KEY = 'toova-recent-queries';
const MAX_RECENT = 6;

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function pushList(key: string, value: string, max = MAX_RECENT) {
  const prev = readList(key).filter((k) => k !== value);
  const next = [value, ...prev].slice(0, max);
  localStorage.setItem(key, JSON.stringify(next));
}

export function loadRecent(): string[] {
  return readList(RECENT_KINDS_KEY);
}

export function pushRecentKind(kind: string) {
  pushList(RECENT_KINDS_KEY, kind);
}

export function loadRecentCommands(): string[] {
  return readList(RECENT_COMMANDS_KEY);
}

export function pushRecentCommand(id: string) {
  pushList(RECENT_COMMANDS_KEY, id);
}

export function loadRecentQueries(): string[] {
  return readList(RECENT_QUERIES_KEY);
}

export function pushRecentQuery(query: string) {
  const q = query.trim();
  if (q.length < 2) return;
  pushList(RECENT_QUERIES_KEY, q.toLowerCase());
}
