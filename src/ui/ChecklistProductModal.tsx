import { useEffect, useRef, useState } from 'react';
import type { CuratedProduct } from '../lib/dormChecklist';
import {
  formatInchDimensions,
  prepareGlbForCatalogUpload,
  readGlbAxisBoundsWithTimeout,
} from '../lib/glbImportPipeline';
import {
  createChecklistProductWithModel,
  parsePriceDollarsToCents,
  updateChecklistProductWithModel,
} from '../lib/shoppingCatalogAdmin';
import { generateGlbFromPhoto } from '../lib/trellisGenerate';
import { trellisUsesRemoteUrl } from '../lib/trellisApi';
import { Banner, Button, Checkbox, Field, Input, Modal, Spinner, Tabs } from './kit';

type ModelTab = 'upload' | 'generate';
type GeneratePhase = 'idle' | 'generating' | 'downloading';

interface ChecklistProductModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  categoryId: string;
  categoryName?: string;
  product?: CuratedProduct | null;
  existingProducts?: { sortOrder: number }[];
  onSaved: () => void;
}

export function ChecklistProductModal({
  open,
  onClose,
  userId,
  categoryId,
  categoryName,
  product,
  existingProducts = [],
  onSaved,
}: ChecklistProductModalProps) {
  const isEdit = Boolean(product);
  const generateAbortRef = useRef<AbortController | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [affiliateUrl, setAffiliateUrl] = useState('');
  const [priceDollars, setPriceDollars] = useState('');
  const [retailer, setRetailer] = useState('Amazon');
  const [published, setPublished] = useState(true);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const [modelTab, setModelTab] = useState<ModelTab>('upload');
  const [glbFile, setGlbFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [decimatedFile, setDecimatedFile] = useState<File | null>(null);
  const [decimating, setDecimating] = useState(false);
  const [decimationWarning, setDecimationWarning] = useState<string | null>(null);
  const [widthIn, setWidthIn] = useState('24');
  const [heightIn, setHeightIn] = useState('24');
  const [depthIn, setDepthIn] = useState('24');

  const [generating, setGenerating] = useState(false);
  const [generatePhase, setGeneratePhase] = useState<GeneratePhase>('idle');
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const busy = submitting || decimating || generating;

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setGenerateError(null);
    if (product) {
      setName(product.name);
      setDescription(product.description);
      setAffiliateUrl(product.affiliateUrl);
      setPriceDollars(
        product.priceCents != null ? String(product.priceCents / 100) : '',
      );
      setRetailer(product.retailer);
      setPublished(product.published);
    } else {
      setName('');
      setDescription('');
      setAffiliateUrl('');
      setPriceDollars('');
      setRetailer('Amazon');
      setPublished(true);
    }
    setCoverFile(null);
    setGlbFile(null);
    setImageFile(null);
    setDecimatedFile(null);
    setDecimationWarning(null);
    setModelTab('upload');
    setWidthIn('24');
    setHeightIn('24');
    setDepthIn('24');
  }, [open, product]);

  useEffect(() => {
    if (!glbFile) {
      setDecimatedFile(null);
      setDecimating(false);
      setDecimationWarning(null);
      return;
    }

    let cancelled = false;
    setDecimatedFile(null);
    setDecimationWarning(null);
    setDecimating(true);

    void prepareGlbForCatalogUpload(glbFile)
      .then(async ({ uploadFile, warning }) => {
        if (cancelled) return;
        setDecimatedFile(uploadFile);
        setDecimationWarning(warning);
        const bounds = await readGlbAxisBoundsWithTimeout(uploadFile);
        if (!cancelled && bounds) {
          const formatted = formatInchDimensions(bounds);
          setWidthIn(formatted.widthIn);
          setHeightIn(formatted.heightIn);
          setDepthIn(formatted.depthIn);
        }
        if (!cancelled) setDecimating(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setDecimationWarning(
          err instanceof Error ? err.message : 'Could not prepare model.',
        );
        setDecimating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [glbFile]);

  const handleClose = () => {
    if (busy) return;
    generateAbortRef.current?.abort();
    onClose();
  };

  const handleGenerate = async () => {
    if (generating || !imageFile) {
      if (!imageFile) setGenerateError('Choose an image first.');
      return;
    }

    generateAbortRef.current?.abort();
    const abortController = new AbortController();
    generateAbortRef.current = abortController;
    setGenerateError(null);
    setGeneratePhase('generating');
    setGenerating(true);

    try {
      setGeneratePhase('downloading');
      const generated = await generateGlbFromPhoto(imageFile, abortController.signal);
      setGlbFile(generated);
      setModelTab('upload');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setGenerateError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
      setGeneratePhase('idle');
      if (generateAbortRef.current === abortController) {
        generateAbortRef.current = null;
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('Product name is required.');
      return;
    }

    const w = Number(widthIn);
    const h = Number(heightIn);
    const d = Number(depthIn);
    if (![w, h, d].every((x) => Number.isFinite(x) && x > 0)) {
      setFormError('Width, height, and depth must be positive numbers (inches).');
      return;
    }

    const uploadFile = decimatedFile;
    const needsModel = !isEdit;

    if (needsModel) {
      if (!glbFile) {
        setFormError('Upload a GLB or generate a model from a photo.');
        return;
      }
      if (decimating) {
        setFormError('Wait for mesh optimization to finish.');
        return;
      }
      if (!uploadFile) {
        setFormError(decimationWarning ?? 'Model file is not ready.');
        return;
      }
    } else if (glbFile) {
      if (decimating) {
        setFormError('Wait for mesh optimization to finish.');
        return;
      }
      if (!uploadFile) {
        setFormError(decimationWarning ?? 'Model file is not ready.');
        return;
      }
    }

    const priceCents = parsePriceDollarsToCents(priceDollars);

    setSubmitting(true);
    try {
      if (isEdit && product) {
        await updateChecklistProductWithModel({
          productId: product.id,
          userId,
          name: name.trim(),
          description,
          affiliateUrl,
          priceCents,
          retailer,
          published,
          coverFile,
          glbFile: uploadFile,
          widthIn: w,
          heightIn: h,
          depthIn: d,
          originalFileName: glbFile?.name,
        });
      } else {
        await createChecklistProductWithModel({
          userId,
          categoryId,
          name: name.trim(),
          description,
          affiliateUrl,
          priceCents,
          retailer,
          published,
          coverFile,
          glbFile: uploadFile!,
          widthIn: w,
          heightIn: h,
          depthIn: d,
          originalFileName: glbFile?.name,
          existingProducts,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const title = isEdit
    ? `Edit product${categoryName ? ` · ${categoryName}` : ''}`
    : `Add product${categoryName ? ` · ${categoryName}` : ''}`;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      width={640}
      scrimClassName="kit-modal__scrim--above-drawer"
    >
      <form className="checklist-product-modal" onSubmit={(e) => void handleSubmit(e)}>
        {formError ? <Banner tone="error">{formError}</Banner> : null}

        <div style={{ display: 'grid', gap: 12 }}>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} required />
          </Field>
          <Field label="Description">
            <textarea
              className="kit-input"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </Field>
          <Field label="Affiliate URL">
            <Input
              value={affiliateUrl}
              onChange={(e) => setAffiliateUrl(e.target.value)}
              placeholder="https://amzn.to/… (optional)"
              disabled={busy}
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Price (USD)">
              <Input
                value={priceDollars}
                onChange={(e) => setPriceDollars(e.target.value)}
                placeholder="29.99"
                disabled={busy}
              />
            </Field>
            <Field label="Retailer">
              <Input value={retailer} onChange={(e) => setRetailer(e.target.value)} disabled={busy} />
            </Field>
          </div>
          <Field label="Cover image">
            <input
              type="file"
              accept="image/*"
              disabled={busy}
              onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
            />
            {coverFile ? (
              <small style={{ display: 'block', marginTop: 6, color: 'var(--ink-4)' }}>
                {coverFile.name}
              </small>
            ) : product?.imageUrl ? (
              <small style={{ display: 'block', marginTop: 6, color: 'var(--ink-4)' }}>
                Current cover kept unless you choose a new file.
              </small>
            ) : null}
          </Field>
          <Checkbox
            checked={published}
            label="Published"
            onChange={setPublished}
            disabled={busy}
          />
        </div>

        <div className="checklist-product-modal-model" style={{ marginTop: 20 }}>
          <Field label={isEdit ? '3D model (optional — replace existing)' : '3D model'}>
            <Tabs
              active={modelTab}
              onChange={(id) => setModelTab(id as ModelTab)}
              tabs={[
                { id: 'upload', label: 'Upload GLB' },
                { id: 'generate', label: 'From a photo' },
              ]}
            />
          </Field>

          {modelTab === 'upload' ? (
            <div style={{ marginTop: 12 }}>
              <input
                type="file"
                accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                disabled={busy}
                onChange={(e) => setGlbFile(e.target.files?.[0] ?? null)}
              />
              {glbFile ? (
                <small style={{ display: 'block', marginTop: 6, color: 'var(--ink-4)' }}>
                  {glbFile.name}
                  {decimating ? ' · optimizing…' : decimatedFile ? ' · ready' : ''}
                </small>
              ) : isEdit && product?.placeCatalogKind ? (
                <small style={{ display: 'block', marginTop: 6, color: 'var(--ink-4)' }}>
                  Model linked — upload a new GLB to replace it.
                </small>
              ) : null}
              {decimationWarning ? (
                <Banner tone="info" style={{ marginTop: 8 }}>
                  {decimationWarning}
                </Banner>
              ) : null}
            </div>
          ) : (
            <div className="import-modal-generate" style={{ marginTop: 12 }}>
              <input
                type="file"
                accept="image/*"
                disabled={busy}
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              />
              {trellisUsesRemoteUrl ? (
                <p className="import-modal-generate-status" style={{ marginTop: 8 }}>
                  Photo is sent to your configured Trellis endpoint.
                </p>
              ) : (
                <p className="import-modal-generate-status" style={{ marginTop: 8 }}>
                  Uses <code className="import-modal-code">/api/trellis/generate</code> in local dev.
                </p>
              )}
              {generateError ? <Banner tone="error">{generateError}</Banner> : null}
              <Button
                type="button"
                size="sm"
                disabled={busy || !imageFile}
                onClick={() => void handleGenerate()}
                style={{ marginTop: 8 }}
              >
                {generating
                  ? generatePhase === 'downloading'
                    ? 'Downloading model…'
                    : 'Generating…'
                  : 'Generate 3D model'}
              </Button>
            </div>
          )}

          {(glbFile || !isEdit) && (
            <div className="import-modal-dims" style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <Field label="Width (in)">
                <Input value={widthIn} onChange={(e) => setWidthIn(e.target.value)} disabled={busy} />
              </Field>
              <Field label="Height (in)">
                <Input value={heightIn} onChange={(e) => setHeightIn(e.target.value)} disabled={busy} />
              </Field>
              <Field label="Depth (in)">
                <Input value={depthIn} onChange={(e) => setDepthIn(e.target.value)} disabled={busy} />
              </Field>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 24, justifyContent: 'flex-end' }}>
          <Button type="button" variant="outline" onClick={handleClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {submitting ? 'Saving…' : isEdit ? 'Save product' : 'Add product'}
          </Button>
        </div>
        {busy ? <Spinner label="Working…" /> : null}
      </form>
    </Modal>
  );
}
