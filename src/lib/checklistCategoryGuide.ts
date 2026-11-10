import type { ChecklistCategory } from './dormChecklist';

/** Fallback copy when guide_why is not set in the catalog. */
export function categoryGuideWhy(category: ChecklistCategory): string {
  const custom = category.guideWhy?.trim();
  if (custom) return custom;
  const name = category.name.trim();
  return `${name} is one of those small choices that makes move-in smoother—you will use it often, and picking the right option now saves a rushed reorder later.`;
}

export function categoryGuideTips(category: ChecklistCategory): string[] {
  const fromDb = category.guideTips?.filter((t) => t.trim()) ?? [];
  if (fromDb.length > 0) return fromDb;
  return [
    'Compare size and reviews before you buy—dorm rooms reward compact picks.',
    'If you already own something similar, mark the category as “Already have” instead of buying twice.',
  ];
}
