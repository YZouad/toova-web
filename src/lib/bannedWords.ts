/** Curated English deny-list for catalog title/description/tags. Keep in sync with SQL `catalog_banned_words()`. */
export const BANNED_WORDS = [
  'fuck',
  'fucker',
  'fucking',
  'shit',
  'bullshit',
  'asshole',
  'bitch',
  'bastard',
  'damn',
  'dammit',
  'cunt',
  'cock',
  'dick',
  'piss',
  'pussy',
  'slut',
  'whore',
  'fag',
  'faggot',
  'dyke',
  'tranny',
  'nigger',
  'nigga',
  'retard',
  'retarded',
  'kike',
  'spic',
  'chink',
  'gook',
  'wetback',
  'rape',
  'rapist',
] as const;

export const BANNED_LANGUAGE_MESSAGE = 'Please remove inappropriate language.';

/** Strip punctuation/spacing so obfuscations like f*ck / s.h.i.t still match. */
export function normalizeForProfanity(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function containsBannedWords(text: string | null | undefined): boolean {
  if (!text) return false;
  const norm = normalizeForProfanity(text);
  if (!norm) return false;
  return BANNED_WORDS.some((w) => norm.includes(w));
}

/** Returns an error message if any field fails, else null. Never echoes the matched word. */
export function validateCatalogText(fields: {
  label?: string | null;
  description?: string | null;
  tags?: string[] | null;
}): string | null {
  if (containsBannedWords(fields.label)) return BANNED_LANGUAGE_MESSAGE;
  if (containsBannedWords(fields.description)) return BANNED_LANGUAGE_MESSAGE;
  if (fields.tags?.some((t) => containsBannedWords(t))) return BANNED_LANGUAGE_MESSAGE;
  return null;
}
