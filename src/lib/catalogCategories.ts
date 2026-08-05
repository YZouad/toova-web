export const CATALOG_CATEGORY_DEFS = [
  { slug: 'seating', label: 'Seating' },
  { slug: 'tables', label: 'Tables' },
  { slug: 'beds', label: 'Beds' },
  { slug: 'storage', label: 'Storage' },
  { slug: 'desks_workspaces', label: 'Desks & Workspaces' },
  { slug: 'lighting', label: 'Lighting' },
  { slug: 'rugs', label: 'Rugs' },
  { slug: 'decor_art', label: 'Decor & Art' },
  { slug: 'plants', label: 'Plants' },
  { slug: 'electronics', label: 'Electronics' },
  { slug: 'appliances', label: 'Appliances' },
  { slug: 'kitchen', label: 'Kitchen' },
  { slug: 'bathroom', label: 'Bathroom' },
  { slug: 'outdoor', label: 'Outdoor' },
  { slug: 'kids', label: 'Kids' },
  { slug: 'pets', label: 'Pets' },
  { slug: 'doors_windows', label: 'Doors & Windows' },
  { slug: 'other', label: 'Other' },
] as const;

export type CatalogCategorySlug = (typeof CATALOG_CATEGORY_DEFS)[number]['slug'];

export const CATALOG_CATEGORY_SLUGS: CatalogCategorySlug[] = CATALOG_CATEGORY_DEFS.map(
  (c) => c.slug,
);

export const MAX_CATALOG_CATEGORIES = 3;

const LABEL_BY_SLUG = Object.fromEntries(
  CATALOG_CATEGORY_DEFS.map((c) => [c.slug, c.label]),
) as Record<CatalogCategorySlug, string>;

export function catalogCategoryLabel(slug: string): string {
  return LABEL_BY_SLUG[slug as CatalogCategorySlug] ?? slug;
}

export function isCatalogCategorySlug(value: string): value is CatalogCategorySlug {
  return (CATALOG_CATEGORY_SLUGS as string[]).includes(value);
}

/** Normalize, dedupe, and enforce max 3. Throws on invalid slug. */
export function normalizeCatalogCategories(
  input: string[],
): CatalogCategorySlug[] {
  const out: CatalogCategorySlug[] = [];
  for (const raw of input) {
    const slug = raw.trim().toLowerCase();
    if (!slug) continue;
    if (!isCatalogCategorySlug(slug)) {
      throw new Error(`Invalid category: ${slug}`);
    }
    if (!out.includes(slug)) out.push(slug);
  }
  if (out.length > MAX_CATALOG_CATEGORIES) {
    throw new Error(`Choose up to ${MAX_CATALOG_CATEGORIES} categories.`);
  }
  return out;
}

export function toggleCatalogCategory(
  current: CatalogCategorySlug[],
  slug: CatalogCategorySlug,
): CatalogCategorySlug[] {
  if (current.includes(slug)) {
    return current.filter((s) => s !== slug);
  }
  if (current.length >= MAX_CATALOG_CATEGORIES) return current;
  return [...current, slug];
}

/** Built-in furniture → default preset categories. */
export const BUILTIN_CATEGORIES: Record<string, CatalogCategorySlug[]> = {
  bed: ['beds'],
  dresser: ['storage'],
  wardrobe: ['storage'],
  desk: ['desks_workspaces'],
  chair: ['seating'],
  nightstand: ['storage', 'beds'],
  lamp: ['lighting'],
};
