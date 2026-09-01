import {
  checklistLineStatus,
  isChecklistResolved,
  isChecklistToPlace,
  leafCategories,
  lowestPriceCentsForProducts,
  type CategoryResolution,
  type ChecklistCategoryWithProducts,
  type ChecklistLineStatus,
  type CuratedProduct,
} from './dormChecklist';

export interface ChecklistLineModel {
  categoryId: string;
  name: string;
  products: CuratedProduct[];
  optionCount: number;
  fromPriceCents: number | null;
  currency: string;
  quantity: number;
  placed: boolean;
  status: ChecklistLineStatus;
  resolution?: CategoryResolution;
  groupId: string;
  groupName: string;
  groupOrder: number;
  sortOrder: number;
}

export interface ChecklistGroupModel {
  id: string;
  name: string;
  order: number;
  resolved: number;
  total: number;
  lines: ChecklistLineModel[];
}

function publishedProducts(products: CuratedProduct[]): CuratedProduct[] {
  const published = products.filter((p) => p.published);
  return published.length > 0 ? published : products;
}

export function buildChecklistLines(input: {
  categories: ChecklistCategoryWithProducts[];
  categoriesById: Record<string, ChecklistCategoryWithProducts>;
  placedCategoryIds: Set<string>;
  getResolution: (categoryId: string) => CategoryResolution | undefined;
  listQty: Map<string, number>;
}): ChecklistLineModel[] {
  const { categories, categoriesById, placedCategoryIds, getResolution, listQty } = input;
  const leaves = leafCategories(categories).filter((c) => c.published);
  const out: ChecklistLineModel[] = [];

  for (const cat of leaves) {
    const parent = cat.parentId ? categoriesById[cat.parentId] : null;
    const group = parent ?? cat;
    const products = publishedProducts(cat.products);
    let quantity = 1;
    for (const p of products) {
      const q = listQty.get(p.id);
      if (q != null) {
        quantity = q;
        break;
      }
    }
    const placed = placedCategoryIds.has(cat.id);
    const resolution = getResolution(cat.id);
    out.push({
      categoryId: cat.id,
      name: cat.name,
      products,
      optionCount: products.length,
      fromPriceCents: lowestPriceCentsForProducts(products),
      currency: products.find((p) => p.priceCents != null)?.currency ?? 'USD',
      quantity,
      placed,
      resolution,
      status: checklistLineStatus(placed, resolution),
      groupId: group.id,
      groupName: group.name,
      groupOrder: group.sortOrder,
      sortOrder: cat.sortOrder,
    });
  }

  return out.sort(
    (a, b) =>
      a.groupOrder - b.groupOrder ||
      a.groupName.localeCompare(b.groupName) ||
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name),
  );
}

export function buildChecklistGroups(
  allLines: ChecklistLineModel[],
  visibleLines: ChecklistLineModel[],
): ChecklistGroupModel[] {
  const map = new Map<string, ChecklistGroupModel>();
  for (const line of visibleLines) {
    let g = map.get(line.groupId);
    if (!g) {
      const allInGroup = allLines.filter((l) => l.groupId === line.groupId);
      g = {
        id: line.groupId,
        name: line.groupName,
        order: line.groupOrder,
        resolved: allInGroup.filter((l) => isChecklistResolved(l.status)).length,
        total: allInGroup.length,
        lines: [],
      };
      map.set(line.groupId, g);
    }
    g.lines.push(line);
  }
  return Array.from(map.values()).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export function filterChecklistLinesByTab(
  lines: ChecklistLineModel[],
  tab: 'todo' | 'placed' | 'all',
): ChecklistLineModel[] {
  if (tab === 'todo') return lines.filter((l) => isChecklistToPlace(l.status));
  if (tab === 'placed') return lines.filter((l) => l.status === 'placed');
  return lines;
}

export function checklistLineStatusLabel(status: ChecklistLineStatus): string | null {
  if (status === 'have') return 'Have';
  if (status === 'skip') return 'Skip';
  return null;
}
