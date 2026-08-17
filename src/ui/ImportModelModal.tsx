import { useEffect, useRef, useState } from 'react';
import { detectCatalogModelSource, uploadCatalogModel } from '../lib/catalogModelUpload';
import { createPosterGlb } from '../lib/createPosterGlb';
import {
  createConversionJob,
  updateConversionJob,
} from '../lib/conversionJobs';
import {
  formatInchDimensions,
  prepareGlbForCatalogUpload,
  readGlbAxisBoundsWithTimeout,
} from '../lib/glbImportPipeline';
import { generateGlbFromPhoto } from '../lib/trellisGenerate';
import { TRELLIS_GENERATE_URL, trellisUsesRemoteUrl } from '../lib/trellisApi';
import { validateCatalogText } from '../lib/bannedWords';
import {
  CATALOG_CATEGORY_DEFS,
  MAX_CATALOG_CATEGORIES,
  toggleCatalogCategory,
  type CatalogCategorySlug,
} from '../lib/catalogCategories';
import { PosterImageCrop } from './PosterImageCrop';
import { Button } from './kit/Button';
import { Checkbox } from './kit/Checkbox';
import { Field } from './kit/Field';
import { Input } from './kit/Input';
import { Modal } from './kit/Modal';
import { Select } from './kit/Select';
import { Spinner } from './kit/Spinner';
import { Tabs } from './kit/Tabs';
import { fetchAdminShoppingCatalog } from '../lib/shoppingCatalog';
import {
  adminLeafCategories,
  createChecklistProductFromCatalog,
  parsePriceDollarsToCents,
} from '../lib/shoppingCatalogAdmin';
import type { ChecklistCategoryWithProducts } from '../lib/dormChecklist';

type ModalTab = 'upload' | 'generate' | 'poster';
type GeneratePhase = 'idle' | 'generating' | 'downloading';

function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host.endsWith('.local')
  );
}

interface ImportModelModalProps {
  userId: string;
  open: boolean;
  initialTab?: ModalTab;
  isAdmin?: boolean;
  onClose: () => void;
  onAdded: () => void | Promise<void>;
}

export function ImportModelModal({
  userId,
  open,
  initialTab = 'upload',
  isAdmin = false,
  onClose,
  onAdded,
}: ImportModelModalProps) {
  const [tab, setTab] = useState<ModalTab>(initialTab);
  const [file, setFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState<CatalogCategorySlug[]>([]);
  const [widthIn, setWidthIn] = useState('24');
  const [heightIn, setHeightIn] = useState('24');
  const [depthIn, setDepthIn] = useState('24');
  const [clearanceIn, setClearanceIn] = useState('');
  const [listInGallery, setListInGallery] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatePhase, setGeneratePhase] = useState<GeneratePhase>('idle');
  const generateAbortRef = useRef<AbortController | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateStatus, setGenerateStatus] = useState<string | null>(null);
  const [decimatedFile, setDecimatedFile] = useState<File | null>(null);
  const [decimating, setDecimating] = useState(false);
  const [decimationError, setDecimationError] = useState<string | null>(null);
  const [decimationInfo, setDecimationInfo] = useState<{
    originalTriangles: number;
    finalTriangles: number;
    skipped?: boolean;
  } | null>(null);

  const [posterImageFile, setPosterImageFile] = useState<File | null>(null);
  const [posterPreviewUrl, setPosterPreviewUrl] = useState<string | null>(null);
  const [posterCroppedBlob, setPosterCroppedBlob] = useState<Blob | null>(null);
  const [creatingPoster, setCreatingPoster] = useState(false);
  const [posterError, setPosterError] = useState<string | null>(null);

  const [addToChecklist, setAddToChecklist] = useState(false);
  const [checklistCategories, setChecklistCategories] = useState<ChecklistCategoryWithProducts[]>([]);
  const [checklistCategoryId, setChecklistCategoryId] = useState('');
  const [checklistAffiliateUrl, setChecklistAffiliateUrl] = useState('');
  const [checklistPriceDollars, setChecklistPriceDollars] = useState('');
  const [checklistCoverFile, setChecklistCoverFile] = useState<File | null>(null);

  const busy = submitting || generating || decimating || creatingPoster;

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open || !isAdmin) return;
    let cancelled = false;
    void fetchAdminShoppingCatalog()
      .then((cats) => {
        if (!cancelled) setChecklistCategories(cats);
      })
      .catch(() => {
        if (!cancelled) setChecklistCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isAdmin]);

  const checklistLeafOptions = adminLeafCategories(checklistCategories);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    if (!posterImageFile) {
      setPosterPreviewUrl(null);
      setPosterCroppedBlob(null);
      return;
    }
    const url = URL.createObjectURL(posterImageFile);
    setPosterPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [posterImageFile]);

  useEffect(() => {
    if (!generating) return;
    const id = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [generating]);

  useEffect(() => {
    if (!file) {
      setDecimatedFile(null);
      setDecimating(false);
      setDecimationError(null);
      setDecimationInfo(null);
      return;
    }

    let cancelled = false;
    setDecimatedFile(null);
    setDecimationInfo(null);
    setDecimationError(null);
    setDecimating(true);

    const dimensionSetters = { setWidthIn, setHeightIn, setDepthIn };

    void prepareGlbForCatalogUpload(file)
      .then(async ({ uploadFile, warning }) => {
        if (cancelled) return;
        setDecimatedFile(uploadFile);
        setDecimationError(warning);
        setDecimationInfo({ originalTriangles: 0, finalTriangles: 0, skipped: true });

        const bounds = await readGlbAxisBoundsWithTimeout(uploadFile);
        if (!cancelled && bounds) {
          const formatted = formatInchDimensions(bounds);
          dimensionSetters.setWidthIn(formatted.widthIn);
          dimensionSetters.setHeightIn(formatted.heightIn);
          dimensionSetters.setDepthIn(formatted.depthIn);
        }
        if (!cancelled) setDecimating(false);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Mesh optimization failed.';
        setDecimationError(message);
        setDecimating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file]);

  const resetForm = () => {
    setTab('upload');
    setFile(null);
    setImageFile(null);
    setTitle('');
    setDescription('');
    setCategories([]);
    setWidthIn('24');
    setHeightIn('24');
    setDepthIn('24');
    setClearanceIn('');
    setListInGallery(false);
    setFormError(null);
    setGenerateError(null);
    setGenerateStatus(null);
    setElapsedSec(0);
    setGenerating(false);
    setGeneratePhase('idle');
    generateAbortRef.current?.abort();
    generateAbortRef.current = null;
    activeJobIdRef.current = null;
    setDecimatedFile(null);
    setDecimating(false);
    setDecimationError(null);
    setDecimationInfo(null);
    setPosterImageFile(null);
    setPosterCroppedBlob(null);
    setPosterPreviewUrl(null);
    setPosterError(null);
    setCreatingPoster(false);
    setAddToChecklist(false);
    setChecklistCategoryId('');
    setChecklistAffiliateUrl('');
    setChecklistPriceDollars('');
    setChecklistCoverFile(null);
  };

  const handleDownloadDecimated = () => {
    if (!decimatedFile) return;
    const a = document.createElement('a');
    const url = URL.createObjectURL(decimatedFile);
    a.href = url;
    a.download = decimatedFile.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClose = () => {
    if (busy) return;
    resetForm();
    onClose();
  };

  const handleGenerate = async () => {
    if (generating) return;

    setGenerateError(null);

    if (!imageFile) {
      setGenerateError('Choose an image first.');
      return;
    }

    generateAbortRef.current?.abort();
    const abortController = new AbortController();
    generateAbortRef.current = abortController;

    setElapsedSec(0);
    setGenerateStatus('Waking Trellis…');
    setGeneratePhase('generating');
    setGenerating(true);

    const jobId = await createConversionJob({
      userId,
      source: 'trellis',
      status: 'processing',
      label: imageFile.name || 'Image → 3D',
    });
    activeJobIdRef.current = jobId;

    try {
      const glbFile = await generateGlbFromPhoto(
        imageFile,
        abortController.signal,
        (message) => {
          setGenerateStatus(message);
          if (message.toLowerCase().includes('download')) {
            setGeneratePhase('downloading');
          }
        },
      );
      setFile(glbFile);
      setTab('upload');
      if (jobId) {
        await updateConversionJob(jobId, {
          status: 'completed',
          label: imageFile.name || 'Image → 3D',
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (jobId) {
          await updateConversionJob(jobId, {
            status: 'failed',
            error: 'Cancelled',
          });
        }
        return;
      }
      console.error('Generation failed:', err);
      const message = err instanceof Error ? err.message : 'Generation failed';
      setGenerateError(message);
      if (jobId) {
        await updateConversionJob(jobId, {
          status: 'failed',
          error: message,
        });
      }
    } finally {
      setGenerating(false);
      setGeneratePhase('idle');
      setGenerateStatus(null);
      if (generateAbortRef.current === abortController) {
        generateAbortRef.current = null;
      }
    }
  };

  const handleCreatePoster = async () => {
    setPosterError(null);

    const w = Number(widthIn);
    const h = Number(heightIn);
    const d = Number(depthIn);
    if (![w, h, d].every((x) => Number.isFinite(x) && x > 0)) {
      setPosterError('Width, height, and depth must be positive numbers (inches).');
      return;
    }
    if (!posterCroppedBlob) {
      setPosterError('Choose an image and align the crop.');
      return;
    }

    setCreatingPoster(true);
    try {
      const glb = await createPosterGlb(posterCroppedBlob, {
        widthIn: w,
        heightIn: h,
        depthIn: d,
      });
      setFile(glb);
      setTab('upload');
      setPosterError(null);
    } catch (err) {
      setPosterError(err instanceof Error ? err.message : 'Could not build poster.');
    } finally {
      setCreatingPoster(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!file) {
      setFormError(
        'Choose a .glb/.gltf file, generate a model from an image, or create a poster.',
      );
      return;
    }
    if (decimating) {
      setFormError('Wait for mesh optimization to finish.');
      return;
    }
    const uploadFile = decimatedFile;
    if (!uploadFile) {
      setFormError(decimationError ?? 'Mesh optimization failed — fix the model file or try again.');
      return;
    }
    const label = title.trim();
    if (!label) {
      setFormError('Title is required.');
      return;
    }

    if (categories.length < 1) {
      setFormError('Pick at least one category (up to three).');
      return;
    }

    if (addToChecklist && isAdmin && !checklistCategoryId) {
      setFormError('Pick a checklist subcategory.');
      return;
    }

    const banned = validateCatalogText({
      label,
      description: description.trim() || null,
    });
    if (banned) {
      setFormError(banned);
      return;
    }

    const w = Number(widthIn);
    const h = Number(heightIn);
    const d = Number(depthIn);
    if (![w, h, d].every((x) => Number.isFinite(x) && x > 0)) {
      setFormError('Width, height, and depth must be positive numbers (inches).');
      return;
    }

    let clearance: number | null = null;
    if (clearanceIn.trim() !== '') {
      const c = Number(clearanceIn);
      if (!Number.isFinite(c) || c < 0) {
        setFormError('Clearance must be a non-negative number or empty.');
        return;
      }
      clearance = c;
    }

    const tags =
      file.name.toLowerCase() === 'poster.glb' ? ['poster'] : [];

    const source = detectCatalogModelSource(file.name, tags);

    setSubmitting(true);
    let jobId = activeJobIdRef.current;
    const hadPriorJob = Boolean(jobId);
    try {
      if (!jobId) {
        jobId = await createConversionJob({
          userId,
          source,
          status: 'processing',
          label,
        });
        activeJobIdRef.current = jobId;
      } else {
        await updateConversionJob(jobId, { label });
      }

      const { kind } = await uploadCatalogModel({
        userId,
        glbFile: uploadFile,
        label,
        widthIn: w,
        heightIn: h,
        depthIn: d,
        clearanceIn: clearance,
        description: description.trim() || null,
        visibility: listInGallery || addToChecklist ? 'public' : 'private',
        categories,
        tags,
        preferFlatImage: source === 'poster' ? posterCroppedBlob : null,
        originalFileName: file.name,
      });

      if (addToChecklist && isAdmin && checklistCategoryId) {
        const cover =
          checklistCoverFile ??
          imageFile ??
          posterImageFile ??
          null;
        await createChecklistProductFromCatalog({
          categoryId: checklistCategoryId,
          name: label,
          catalogKind: kind,
          affiliateUrl: checklistAffiliateUrl,
          priceCents: parsePriceDollarsToCents(checklistPriceDollars),
          coverFile: cover,
          description: description.trim() || undefined,
        });
      }

      if (jobId) {
        await updateConversionJob(jobId, {
          status: 'completed',
          kind,
          label,
          error: null,
        });
      }
      activeJobIdRef.current = null;

      await onAdded();
      resetForm();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setFormError(message);
      // Don't overwrite a completed Trellis conversion if only catalog save failed.
      if (jobId && !hadPriorJob) {
        await updateConversionJob(jobId, {
          status: 'failed',
          error: message,
          label,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const posterAspectRatio = (() => {
    const pw = Number(widthIn);
    const ph = Number(heightIn);
    if (
      Number.isFinite(pw) &&
      Number.isFinite(ph) &&
      pw > 0 &&
      ph > 0
    ) {
      return pw / ph;
    }
    return 18 / 24;
  })();

  if (!open) return null;

  const tabFooter = (primary: React.ReactNode) => (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
      <Button size="sm" variant="outline" onClick={handleClose} disabled={busy}>Cancel</Button>
      {primary}
    </div>
  );

  return (
    <Modal
      open={open}
      meta="Import model"
      title="Bring a piece in."
      onClose={handleClose}
      width={560}
    >
      <Tabs
        active={tab}
        onChange={(id) => {
          const next = id as ModalTab;
          setTab(next);
          setFormError(null);
          setGenerateError(null);
          setPosterError(null);
          if (next === 'poster') {
            setPosterImageFile(null);
            setPosterCroppedBlob(null);
            if (widthIn === '24' && heightIn === '24' && depthIn === '24') {
              setWidthIn('18');
              setHeightIn('24');
              setDepthIn('0.25');
            }
          }
        }}
        style={{ marginTop: 16, marginBottom: 22 }}
        tabs={[
          { id: 'upload', label: 'Upload GLB' },
          { id: 'generate', label: 'From a photo' },
          { id: 'poster', label: 'Poster' },
        ]}
      />

        {tab === 'generate' ? (
          <div className="import-modal-generate">
            <label className="import-modal-field">
              <span>Source image</span>
              <input
                type="file"
                accept="image/*"
                onChange={(ev) => setImageFile(ev.target.files?.[0] ?? null)}
                disabled={busy}
              />
            </label>

            {imagePreviewUrl ? (
              <img
                className="import-modal-generate-preview"
                src={imagePreviewUrl}
                alt="Preview of selected image"
              />
            ) : null}

            {generating ? (
              <Spinner
                label={
                  generateStatus
                    ? `${generateStatus} · ${elapsedSec}s`
                    : generatePhase === 'downloading'
                      ? `Downloading model · ${elapsedSec}s`
                      : `Generating 3D · ${elapsedSec}s`
                }
              />
            ) : trellisUsesRemoteUrl ? (
              <p className="import-modal-generate-status">
                Uses your configured TRELLIS endpoint (HTTPS). If this fails, confirm CORS on the API
                and that the URL is not blocked (mixed content).
              </p>
            ) : isLocalDevHost() ? (
              <p className="import-modal-generate-status">
                Local: Vite proxies <code className="import-modal-code">/api/trellis</code> to
                the Render BFF (configure{' '}
                <code className="import-modal-code">TRELLIS_BFF_ORIGIN</code> in{' '}
                <code className="import-modal-code">.env.local</code>). Use{' '}
                <code className="import-modal-code">npm run dev</code> or{' '}
                <code className="import-modal-code">npm run preview</code>.
              </p>
            ) : null}

            {generateError ? (
              <div className="import-modal-error" role="alert">
                {generateError}
              </div>
            ) : null}

            <div className="import-modal-actions">
              {tabFooter(
                <Button size="sm" disabled={busy} onClick={() => void handleGenerate()}>
                  {generating
                    ? generateStatus ??
                      (generatePhase === 'downloading' ? 'Downloading…' : 'Generating…')
                    : 'Generate 3D model'}
                </Button>,
              )}
            </div>
          </div>
        ) : tab === 'poster' ? (
          <div className="import-modal-generate">
            <p className="import-modal-generate-status">
              Set poster size first (aspect ratio locks the crop), pick a photo, pan and zoom inside the frame,
              then create a textured flat GLB. You can tweak catalog dimensions again on Upload before saving.
            </p>

            <div className="import-modal-dims">
              <label className="import-modal-field">
                <span>Width (in)</span>
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={widthIn}
                  onChange={(e) => setWidthIn(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="import-modal-field">
                <span>Height (in)</span>
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={heightIn}
                  onChange={(e) => setHeightIn(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="import-modal-field">
                <span>Depth (in)</span>
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={depthIn}
                  onChange={(e) => setDepthIn(e.target.value)}
                  disabled={busy}
                />
              </label>
            </div>

            <label className="import-modal-field">
              <span>Poster image</span>
              <input
                type="file"
                accept="image/*"
                onChange={(ev) => setPosterImageFile(ev.target.files?.[0] ?? null)}
                disabled={busy}
              />
            </label>

            <PosterImageCrop
              imageUrl={posterPreviewUrl}
              aspect={posterAspectRatio}
              disabled={busy}
              onCropped={setPosterCroppedBlob}
            />

            {posterError ? (
              <div className="import-modal-error" role="alert">
                {posterError}
              </div>
            ) : null}

            <div className="import-modal-actions">
              {tabFooter(
                <Button size="sm" disabled={busy || !posterCroppedBlob} onClick={() => void handleCreatePoster()}>
                  {creatingPoster ? 'Creating…' : 'Create poster'}
                </Button>,
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)}>
            <label className="import-modal-field">
              <span>Model file (.glb / .gltf)</span>
              <input
                type="file"
                accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                onChange={(ev) => setFile(ev.target.files?.[0] ?? null)}
                disabled={submitting || decimating}
              />
            </label>

            {decimating ? (
              <p className="import-modal-generate-status" aria-live="polite">
                {file?.name === 'generated.glb'
                  ? 'Processing downloaded model…'
                  : 'Optimizing mesh… (may take a minute on large models)'}
              </p>
            ) : null}

            {decimationInfo?.skipped && file?.name.toLowerCase() === 'generated.glb' ? (
              <p className="import-modal-decimate-skip">
                AI model prepared for room lighting (materials normalized, normals repaired). Polygon
                reduction is skipped — you can add it to the library as-is.
              </p>
            ) : null}

            {decimationInfo?.skipped && file?.name.toLowerCase().endsWith('.gltf') ? (
              <p className="import-modal-decimate-skip">
                Polygon reduction applies to <strong>.glb</strong> only; .gltf files are uploaded as-is.
              </p>
            ) : null}

            {decimationInfo && !decimationInfo.skipped && decimationInfo.originalTriangles > 0 ? (
              <div className="import-modal-decimate-info">
                {decimationInfo.originalTriangles.toLocaleString()} →{' '}
                {decimationInfo.finalTriangles.toLocaleString()} triangles (≤50K target)
              </div>
            ) : null}

            {decimationError ? (
              <div className="import-modal-error" role="status">
                {decimationError}
              </div>
            ) : null}

            {file?.name === 'generated.glb' && decimatedFile && !decimating ? (
              <p className="import-modal-generate-hint">
                Model ready — set dimensions below, then add to library.
              </p>
            ) : null}

            {decimatedFile &&
            !decimating &&
            (file?.name?.toLowerCase() ?? '').endsWith('.glb') &&
            file?.name.toLowerCase() !== 'generated.glb' &&
            decimationInfo &&
            !decimationInfo.skipped ? (
              <button
                type="button"
                className="import-modal-decimate-btn"
                onClick={handleDownloadDecimated}
                disabled={submitting}
              >
                Download 50K polygon version
              </button>
            ) : null}

            {file?.name?.toLowerCase() === 'poster.glb' ? (
              <p className="import-modal-generate-hint">
                Using flat poster from your cropped image. Adjust dimensions below if needed, then add to library.
              </p>
            ) : null}

            <Field label="Title">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  file?.name?.toLowerCase() === 'poster.glb'
                    ? 'e.g. Poster'
                    : 'e.g. Reading Armchair'
                }
                disabled={submitting || decimating}
                autoComplete="off"
              />
            </Field>

            <Field label="Description">
              <textarea
                className="kit-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional notes"
                rows={3}
                disabled={submitting || decimating}
                style={{ width: '100%', resize: 'vertical', minHeight: 72 }}
              />
            </Field>

            <div className="import-modal-field">
              <span>
                Categories ({categories.length}/{MAX_CATALOG_CATEGORIES})
              </span>
              <div className="import-category-chips" role="group" aria-label="Categories">
                {CATALOG_CATEGORY_DEFS.map((c) => {
                  const active = categories.includes(c.slug);
                  const disabledChip =
                    submitting ||
                    decimating ||
                    (!active && categories.length >= MAX_CATALOG_CATEGORIES);
                  return (
                    <button
                      key={c.slug}
                      type="button"
                      className={`gallery-chip${active ? ' is-active' : ''}`}
                      disabled={disabledChip}
                      onClick={() =>
                        setCategories((prev) => toggleCatalogCategory(prev, c.slug))
                      }
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="import-modal-field import-modal-check">
              <Checkbox
                checked={listInGallery}
                label="List in community gallery"
                onChange={setListInGallery}
                disabled={submitting || decimating}
              />
              <small>
                Public models can be browsed, liked, and placed in anyone&apos;s room.
              </small>
            </label>

            {isAdmin ? (
              <div className="import-modal-field" style={{ borderTop: '1px solid var(--rule-soft)', paddingTop: 16 }}>
                <Checkbox
                  checked={addToChecklist}
                  label="Also add to checklist"
                  onChange={setAddToChecklist}
                  disabled={submitting || decimating}
                />
                {addToChecklist ? (
                  <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                    <Field label="Checklist subcategory">
                      <Select
                        value={checklistCategoryId}
                        onChange={setChecklistCategoryId}
                        disabled={submitting || decimating}
                        options={[
                          { value: '', label: 'Select subcategory…' },
                          ...checklistLeafOptions.map((c) => ({
                            value: c.id,
                            label: c.name,
                          })),
                        ]}
                      />
                    </Field>
                    <Field label="Affiliate URL">
                      <Input
                        value={checklistAffiliateUrl}
                        onChange={(e) => setChecklistAffiliateUrl(e.target.value)}
                        placeholder="https://amzn.to/… (optional)"
                        disabled={submitting || decimating}
                      />
                    </Field>
                    <Field label="Price (USD)">
                      <Input
                        value={checklistPriceDollars}
                        onChange={(e) => setChecklistPriceDollars(e.target.value)}
                        placeholder="29.99"
                        disabled={submitting || decimating}
                      />
                    </Field>
                    <Field label="Cover image">
                      <input
                        type="file"
                        accept="image/*"
                        disabled={submitting || decimating}
                        onChange={(e) => setChecklistCoverFile(e.target.files?.[0] ?? null)}
                      />
                      <small style={{ display: 'block', marginTop: 6, color: 'var(--ink-4)' }}>
                        {checklistCoverFile
                          ? checklistCoverFile.name
                          : imageFile
                            ? `Using generate photo: ${imageFile.name}`
                            : posterImageFile
                              ? `Using poster image: ${posterImageFile.name}`
                              : 'Optional — uses source photo when available'}
                      </small>
                    </Field>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="import-modal-dims">
              <label className="import-modal-field">
                <span>Width (in)</span>
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={widthIn}
                  onChange={(e) => setWidthIn(e.target.value)}
                  disabled={submitting || decimating}
                />
              </label>
              <label className="import-modal-field">
                <span>Height (in)</span>
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={heightIn}
                  onChange={(e) => setHeightIn(e.target.value)}
                  disabled={submitting || decimating}
                />
              </label>
              <label className="import-modal-field">
                <span>Depth (in)</span>
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={depthIn}
                  onChange={(e) => setDepthIn(e.target.value)}
                  disabled={submitting || decimating}
                />
              </label>
              <label className="import-modal-field">
                <span>Clearance (in, optional)</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={clearanceIn}
                  onChange={(e) => setClearanceIn(e.target.value)}
                  placeholder="—"
                  disabled={submitting || decimating}
                />
              </label>
            </div>

            {formError ? (
              <div className="import-modal-error" role="alert">
                {formError}
              </div>
            ) : null}

            <div className="import-modal-actions">
              {tabFooter(
                <Button type="submit" size="sm" disabled={submitting || decimating || !decimatedFile}>
                  {submitting ? 'Saving…' : 'Add to library'}
                </Button>,
              )}
            </div>
          </form>
        )}
    </Modal>
  );
}
