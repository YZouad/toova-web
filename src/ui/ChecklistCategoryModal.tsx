import { useEffect, useState } from 'react';
import type { ChecklistCategoryWithProducts } from '../lib/dormChecklist';
import {
  attachCategoryCoverImage,
  updateChecklistCategory,
} from '../lib/shoppingCatalogAdmin';
import { Banner, Button, Field, Input, Modal } from './kit';

interface ChecklistCategoryModalProps {
  open: boolean;
  onClose: () => void;
  category: ChecklistCategoryWithProducts | null;
  onSaved: () => void;
}

export function ChecklistCategoryModal({
  open,
  onClose,
  category,
  onSaved,
}: ChecklistCategoryModalProps) {
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !category) return;
    setName(category.name);
    setSortOrder(String(category.sortOrder));
    setCoverFile(null);
    setError(null);
  }, [open, category?.id, category?.name, category?.sortOrder]);

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) return;
    if (!name.trim()) {
      setError('Category name is required.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await updateChecklistCategory(category.id, {
        name: name.trim(),
        sortOrder: Number(sortOrder) || category.sortOrder,
      });
      if (coverFile) {
        await attachCategoryCoverImage(category.id, coverFile);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !category) return null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Edit category"
      width={480}
      scrimClassName="kit-modal__scrim--above-drawer"
    >
      <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'grid', gap: 14 }}>
        {error ? <Banner tone="error">{error}</Banner> : null}

        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={submitting} required />
        </Field>

        <Field label="Sort order">
          <Input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} disabled={submitting} />
        </Field>

        <Field label="Cover photo">
          {category.imageUrl && !coverFile ? (
            <div className="checklist-category-cover-preview">
              <img src={category.imageUrl} alt="" referrerPolicy="no-referrer" />
            </div>
          ) : null}
          <input
            type="file"
            accept="image/*"
            disabled={submitting}
            onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
          />
          <small style={{ display: 'block', marginTop: 6, color: 'var(--ink-4)' }}>
            {coverFile
              ? coverFile.name
              : category.imageUrl
                ? 'Choose a new file to replace the cover.'
                : 'Optional — shown on the gallery tile when set.'}
          </small>
        </Field>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save category'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
