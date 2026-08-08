import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChecklistCategoryWithProducts } from '../lib/dormChecklist';
import {
  childCategories,
  topLevelCategories,
} from '../lib/dormChecklist';
import { fetchAdminShoppingCatalog } from '../lib/shoppingCatalog';
import {
  attachCategoryCoverImage,
  createChecklistCategory,
  deleteChecklistCategory,
  hasChildCategories,
  updateChecklistCategory,
} from '../lib/shoppingCatalogAdmin';
import { Banner, Button, Field, Input, MonoMeta, Spinner } from './kit';

interface ChecklistAdminPanelProps {
  groupId: string | null;
  openCategoryId: string | null;
  onGroupChange: (id: string | null) => void;
  onOpenCategoryChange: (id: string | null) => void;
  onCatalogChanged: () => void;
}

export function ChecklistAdminPanel({
  groupId,
  openCategoryId,
  onGroupChange,
  onOpenCategoryChange,
  onCatalogChanged,
}: ChecklistAdminPanelProps) {
  const [categories, setCategories] = useState<ChecklistCategoryWithProducts[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [editCategoryName, setEditCategoryName] = useState('');
  const [editCategorySort, setEditCategorySort] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cats = await fetchAdminShoppingCatalog();
      setCategories(cats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load admin catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeGroup = useMemo(
    () => categories.find((c) => c.id === groupId) ?? null,
    [categories, groupId],
  );
  const openCategory = useMemo(
    () => categories.find((c) => c.id === openCategoryId) ?? null,
    [categories, openCategoryId],
  );
  const selectedCategory = openCategory ?? activeGroup;
  const isLeafContext = openCategory != null;

  useEffect(() => {
    if (!selectedCategory) {
      setEditCategoryName('');
      setEditCategorySort('');
      return;
    }
    setEditCategoryName(selectedCategory.name);
    setEditCategorySort(String(selectedCategory.sortOrder));
    setCoverFile(null);
  }, [selectedCategory?.id, selectedCategory?.name, selectedCategory?.sortOrder]);

  async function runMutation(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
      onCatalogChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return;
    const parentId = groupId && !openCategoryId ? groupId : null;
    await runMutation(async () => {
      await createChecklistCategory(
        { name: newCategoryName.trim(), parentId },
        categories,
      );
      setNewCategoryName('');
    });
  }

  async function handleSaveCategory() {
    if (!selectedCategory) return;
    await runMutation(async () => {
      await updateChecklistCategory(selectedCategory.id, {
        name: editCategoryName.trim() || selectedCategory.name,
        sortOrder: Number(editCategorySort) || selectedCategory.sortOrder,
      });
      if (coverFile) {
        await attachCategoryCoverImage(selectedCategory.id, coverFile);
        setCoverFile(null);
      }
    });
  }

  async function handleToggleCategoryPublished() {
    if (!selectedCategory) return;
    await runMutation(async () => {
      await updateChecklistCategory(selectedCategory.id, {
        published: !selectedCategory.published,
      });
    });
  }

  async function handleDeleteCategory() {
    if (!selectedCategory) return;
    const msg = hasChildCategories(categories, selectedCategory.id)
      ? 'Delete this category and all subcategories/products?'
      : 'Delete this category and its products?';
    if (!window.confirm(msg)) return;
    await runMutation(async () => {
      await deleteChecklistCategory(selectedCategory.id);
      if (openCategoryId === selectedCategory.id) onOpenCategoryChange(null);
      if (groupId === selectedCategory.id) onGroupChange(null);
    });
  }

  const addCategoryLabel = !groupId
    ? 'New top-level category'
    : openCategoryId
      ? null
      : 'New subcategory';

  return (
    <aside className="checklist-admin-panel">
      <div className="checklist-admin-panel-head">
        <MonoMeta size="xs" tone="dense" upper>
          Admin manage
        </MonoMeta>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>

      {error ? <Banner tone="error">{error}</Banner> : null}
      {loading ? <Spinner label="Loading admin catalog…" /> : null}

      {!loading ? (
        <>
          {addCategoryLabel ? (
            <div className="checklist-admin-block">
              <Field label={addCategoryLabel}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Category name"
                    disabled={busy}
                  />
                  <Button size="sm" disabled={busy} onClick={() => void handleAddCategory()}>
                    Add
                  </Button>
                </div>
              </Field>
            </div>
          ) : null}

          {selectedCategory ? (
            <div className="checklist-admin-block">
              <MonoMeta size="sm" tone="dense" style={{ display: 'block', marginBottom: 8 }}>
                Edit {isLeafContext ? 'subcategory' : 'category'}
              </MonoMeta>
              <Field label="Name">
                <Input
                  value={editCategoryName}
                  onChange={(e) => setEditCategoryName(e.target.value)}
                  disabled={busy}
                />
              </Field>
              <Field label="Sort order">
                <Input
                  value={editCategorySort}
                  onChange={(e) => setEditCategorySort(e.target.value)}
                  disabled={busy}
                />
              </Field>
              <Field label="Cover photo">
                {selectedCategory.imageUrl && !coverFile ? (
                  <div className="checklist-category-cover-preview">
                    <img src={selectedCategory.imageUrl} alt="" referrerPolicy="no-referrer" />
                  </div>
                ) : null}
                <input
                  type="file"
                  accept="image/*"
                  disabled={busy}
                  onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
                />
                <small style={{ display: 'block', marginTop: 6, color: 'var(--ink-4)' }}>
                  {coverFile
                    ? coverFile.name
                    : selectedCategory.imageUrl
                      ? 'Choose a new file to replace the cover.'
                      : 'Optional — shown on the gallery tile.'}
                </small>
              </Field>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                <Button size="sm" disabled={busy} onClick={() => void handleSaveCategory()}>
                  Save category
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void handleToggleCategoryPublished()}>
                  {selectedCategory.published ? 'Unpublish' : 'Publish'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void handleDeleteCategory()}
                  style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ) : null}

          {isLeafContext && openCategory ? (
            <MonoMeta size="xs" tone="subtle" style={{ display: 'block', marginTop: 12 }}>
              Products are managed in the category drawer — use Add product there.
            </MonoMeta>
          ) : null}

          {!groupId && !openCategoryId ? (
            <MonoMeta size="xs" tone="subtle" style={{ display: 'block', marginTop: 8 }}>
              Top groups: {topLevelCategories(categories).length} · Subcategories:{' '}
              {categories.filter((c) => c.parentId).length}
            </MonoMeta>
          ) : null}
        </>
      ) : null}
    </aside>
  );
}
