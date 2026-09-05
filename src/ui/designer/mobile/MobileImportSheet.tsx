import { useCallback, useEffect, useRef, useSyncExternalStore, useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import {
  CATALOG_CATEGORY_DEFS,
  MAX_CATALOG_CATEGORIES,
  toggleCatalogCategory,
  type CatalogCategorySlug,
} from '../../../lib/catalogCategories';
import type { ChecklistCategoryWithProducts } from '../../../lib/dormChecklist';
import { fetchAdminShoppingCatalog } from '../../../lib/shoppingCatalog';
import {
  adminLeafCategories,
  createChecklistProductFromCatalog,
  parsePriceDollarsToCents,
} from '../../../lib/shoppingCatalogAdmin';
import { TRELLIS_STARTING_STATUS } from '../../../lib/trellisApi';
import { PhotoSubjectPrep } from '../../PhotoSubjectPrep';
import { PosterImageCrop } from '../../PosterImageCrop';
import type { CatalogModel, ImportRoute } from '../chromeTypes';
import {
  buildPosterGlb,
  prepareGlbFile,
  runPhotoGenerate,
  submitCatalogImport,
} from '../importLogic';
import { MobileSheet } from './MobileSheet';
import {
  getPhotoJobSnapshot,
  patchPhotoJob,
  photoJobAbortRef,
  photoJobBusy,
  resetPhotoJob,
  startPhotoJobElapsed,
  stopPhotoJobElapsed,
  subscribePhotoJob,
} from './mobileImportController';

export interface MobileImportSheetProps {
  open: boolean;
  route: ImportRoute;
  onRoute: (r: ImportRoute) => void;
  onClose: () => void;
  isAdmin?: boolean;
  onComplete?: (model: CatalogModel) => void;
}

const POSTER_SIZES = [
  { label: '8×10', widthIn: '8', heightIn: '10' },
  { label: '11×14', widthIn: '11', heightIn: '14' },
  { label: '18×24', widthIn: '18', heightIn: '24' },
  { label: '24×36', widthIn: '24', heightIn: '36' },
] as const;

function positiveInches(value: string): boolean {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function sheetTitle(route: ImportRoute): string {
  if (route === 'photo') return 'From a photo';
  if (route === 'poster') return 'Make a poster';
  if (route === 'upload') return 'Upload a model';
  return 'Bring a piece in';
}

function sheetEyebrow(route: ImportRoute): string {
  return route ? 'Your models · private until you share' : 'Your models · add to library';
}

export function MobileImportSheet({
  open,
  route,
  onRoute,
  onClose,
  isAdmin = false,
  onComplete,
}: MobileImportSheetProps) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const photoJob = useSyncExternalStore(subscribePhotoJob, getPhotoJobSnapshot, getPhotoJobSnapshot);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const glbInputRef = useRef<HTMLInputElement>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [decimating, setDecimating] = useState(false);
  const [decimationError, setDecimationError] = useState<string | null>(null);

  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const [posterImageFile, setPosterImageFile] = useState<File | null>(null);
  const [posterPreviewUrl, setPosterPreviewUrl] = useState<string | null>(null);
  const [posterCroppedBlob, setPosterCroppedBlob] = useState<Blob | null>(null);
  const [creatingPoster, setCreatingPoster] = useState(false);
  const [posterError, setPosterError] = useState<string | null>(null);
  const [posterSizeIdx, setPosterSizeIdx] = useState(2);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState<CatalogCategorySlug[]>([]);
  const [widthIn, setWidthIn] = useState('24');
  const [heightIn, setHeightIn] = useState('24');
  const [depthIn, setDepthIn] = useState('24');
  const [clearanceIn, setClearanceIn] = useState('');
  const [listInGallery, setListInGallery] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [addToChecklist, setAddToChecklist] = useState(false);
  const [checklistCategories, setChecklistCategories] = useState<
    ChecklistCategoryWithProducts[]
  >([]);
  const [checklistCategoryId, setChecklistCategoryId] = useState('');
  const [checklistAffiliateUrl, setChecklistAffiliateUrl] = useState('');
  const [checklistPriceDollars, setChecklistPriceDollars] = useState('');
  const [checklistCoverFile, setChecklistCoverFile] = useState<File | null>(null);

  const resetFormOnly = useCallback(() => {
    setFile(null);
    setUploadFile(null);
    setDecimating(false);
    setDecimationError(null);
    setPosterImageFile(null);
    setPosterCroppedBlob(null);
    setPosterError(null);
    setCreatingPoster(false);
    setTitle('');
    setDescription('');
    setCategories([]);
    setWidthIn('24');
    setHeightIn('24');
    setDepthIn('24');
    setClearanceIn('');
    setListInGallery(false);
    setFormError(null);
    setAddToChecklist(false);
    setChecklistCategoryId('');
    setChecklistAffiliateUrl('');
    setChecklistPriceDollars('');
    setChecklistCoverFile(null);
  }, []);

  const resetAll = useCallback(() => {
    resetFormOnly();
    resetPhotoJob(true);
  }, [resetFormOnly]);

  useEffect(() => {
    if (open) return;
    if (photoJobBusy()) return;
    resetFormOnly();
  }, [open, resetFormOnly]);

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

  // Prefer the prepared image so the shot shown during generation is the one sent.
  useEffect(() => {
    const src = photoJob.preparedFile ?? photoJob.imageFile;
    if (!src) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(src);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoJob.preparedFile, photoJob.imageFile]);

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
    if (photoJob.glbFile && route === 'photo') {
      setFile(photoJob.glbFile);
    }
  }, [photoJob.glbFile, route]);

  useEffect(() => {
    const activeFile = file ?? photoJob.glbFile;
    if (!activeFile) {
      setUploadFile(null);
      setDecimating(false);
      setDecimationError(null);
      return;
    }
    let cancelled = false;
    setUploadFile(null);
    setDecimationError(null);
    setDecimating(true);
    void prepareGlbFile(activeFile)
      .then((result) => {
        if (cancelled) return;
        setUploadFile(result.uploadFile);
        setDecimationError(result.warning);
        setWidthIn(result.widthIn);
        setHeightIn(result.heightIn);
        setDepthIn(result.depthIn);
        setDecimating(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setDecimationError(err instanceof Error ? err.message : 'Mesh optimization failed.');
        setDecimating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file, photoJob.glbFile]);

  const pickRoute = (id: Exclude<ImportRoute, null>) => {
    onRoute(id);
    setFormError(null);
    patchPhotoJob({ error: null });
    setPosterError(null);
    if (id === 'poster') {
      const size = POSTER_SIZES[posterSizeIdx];
      setWidthIn(size.widthIn);
      setHeightIn(size.heightIn);
      setDepthIn('0.25');
    }
  };

  const onPhotoFile = (f: File | null) => {
    if (!f) return;
    patchPhotoJob({ imageFile: f, preparedFile: null, error: null, glbFile: null });
    setFile(null);
    if (!title.trim()) {
      setTitle(f.name.replace(/\.(jpe?g|png|webp)$/i, ''));
    }
  };

  const handleGenerate = async () => {
    if (!userId || !photoJob.preparedFile || photoJob.generating) return;
    patchPhotoJob({ error: null });
    photoJobAbortRef.current?.abort();
    const abort = new AbortController();
    photoJobAbortRef.current = abort;
    patchPhotoJob({
      generating: true,
      phase: 'generating',
      status: TRELLIS_STARTING_STATUS,
      elapsedSec: 0,
      glbFile: null,
      jobId: null,
    });
    startPhotoJobElapsed();
    try {
      const { glbFile, jobId } = await runPhotoGenerate(
        photoJob.preparedFile,
        userId,
        abort.signal,
        (message) => {
          patchPhotoJob({
            status: message,
            phase: message.toLowerCase().includes('download') ? 'downloading' : 'generating',
          });
        },
      );
      patchPhotoJob({ glbFile, jobId, generating: false, phase: 'idle', status: null });
      setFile(glbFile);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      patchPhotoJob({
        error: err instanceof Error ? err.message : 'Generation failed',
        generating: false,
        phase: 'idle',
        status: null,
      });
    } finally {
      stopPhotoJobElapsed();
      if (photoJobAbortRef.current === abort) photoJobAbortRef.current = null;
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
      const glb = await buildPosterGlb(posterCroppedBlob, w, h, d);
      setFile(glb);
      setPosterError(null);
    } catch (err) {
      setPosterError(err instanceof Error ? err.message : 'Could not build poster.');
    } finally {
      setCreatingPoster(false);
    }
  };

  const handleSubmit = async () => {
    if (!userId) {
      setFormError('Sign in to save a model.');
      return;
    }
    const activeFile = file ?? photoJob.glbFile;
    setFormError(null);
    if (!activeFile) {
      setFormError('Add a model file before saving.');
      return;
    }
    if (decimating) {
      setFormError('Wait for mesh optimization to finish.');
      return;
    }
    if (!uploadFile) {
      setFormError(decimationError ?? 'Mesh optimization failed.');
      return;
    }
    if (addToChecklist && isAdmin && !checklistCategoryId) {
      setFormError('Pick a checklist subcategory.');
      return;
    }
    setSubmitting(true);
    try {
      const model = await submitCatalogImport({
        userId,
        file: activeFile,
        uploadFile,
        form: {
          title,
          description,
          categories,
          widthIn,
          heightIn,
          depthIn,
          clearanceIn,
          listInGallery: listInGallery || (isAdmin && addToChecklist),
        },
        posterCroppedBlob,
        priorJobId: photoJob.jobId,
      });
      if (addToChecklist && isAdmin && checklistCategoryId) {
        const cover =
          checklistCoverFile ?? photoJob.preparedFile ?? photoJob.imageFile ?? posterImageFile ?? null;
        await createChecklistProductFromCatalog({
          categoryId: checklistCategoryId,
          name: title.trim(),
          catalogKind: model.kind,
          affiliateUrl: checklistAffiliateUrl,
          priceCents: parsePriceDollarsToCents(checklistPriceDollars),
          coverFile: cover,
          description: description.trim() || undefined,
        });
      }
      onComplete?.(model);
      resetAll();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting || decimating || creatingPoster) return;
    if (photoJob.generating) {
      onClose();
      return;
    }
    resetAll();
    onClose();
  };

  const handleBack = () => {
    if (route) {
      onRoute(null);
      setFormError(null);
      return;
    }
    handleClose();
  };

  if (!open) return null;

  const activeRoute = route;
  const busy = submitting || photoJob.generating || decimating || creatingPoster;
  const activeFile = file ?? photoJob.glbFile;
  const fileReady = Boolean(activeFile && uploadFile && !decimating);
  const nameOk = title.trim().length > 0;
  const catsOk = categories.length >= 1 && categories.length <= MAX_CATALOG_CATEGORIES;
  const dimsOk =
    positiveInches(widthIn) && positiveInches(heightIn) && positiveInches(depthIn);
  const posterAspect = (() => {
    const pw = Number(widthIn);
    const ph = Number(heightIn);
    if (Number.isFinite(pw) && Number.isFinite(ph) && pw > 0 && ph > 0) return pw / ph;
    return 18 / 24;
  })();
  const checklistLeafOptions = adminLeafCategories(checklistCategories);
  const showMetadata =
    activeRoute === 'upload'
      ? fileReady
      : activeRoute === 'photo'
        ? fileReady
        : activeRoute === 'poster'
          ? fileReady
          : false;

  const canSave = fileReady && nameOk && catsOk && dimsOk && !busy && Boolean(userId);

  const primaryLabel = (() => {
    if (!activeRoute) return 'Pick a route';
    if (activeRoute === 'photo') {
      if (photoJob.generating) return 'Generating…';
      if (!photoJob.imageFile) return 'Take a photo';
      if (!fileReady) return 'Send to 3D generation';
      return submitting ? 'Saving…' : 'Add to library';
    }
    if (activeRoute === 'poster') {
      if (!posterCroppedBlob) return 'Create poster';
      if (!fileReady) return creatingPoster ? 'Building…' : 'Build poster';
      return submitting ? 'Saving…' : 'Add to library';
    }
    return submitting ? 'Saving…' : 'Add to library';
  })();

  const primaryDisabled = (() => {
    if (!activeRoute) return true;
    if (activeRoute === 'photo') {
      if (photoJob.generating) return true;
      if (!photoJob.imageFile) return true;
      if (!fileReady) return !userId || !photoJob.preparedFile;
      return !canSave;
    }
    if (activeRoute === 'poster') {
      if (!posterCroppedBlob) return busy;
      if (!fileReady) return busy;
      return !canSave;
    }
    return !canSave;
  })();

  const onPrimary = () => {
    if (!activeRoute) return;
    if (activeRoute === 'photo') {
      if (!photoJob.imageFile) {
        cameraInputRef.current?.click();
        return;
      }
      if (!fileReady) {
        void handleGenerate();
        return;
      }
      void handleSubmit();
      return;
    }
    if (activeRoute === 'poster') {
      if (!fileReady) {
        void handleCreatePoster();
        return;
      }
      void handleSubmit();
      return;
    }
    void handleSubmit();
  };

  const renderMetadataForm = () => (
    <div className="dgm-import-form">
      <label className="dgm-field">
        <span className="dgm-field__label">
          Name it <span className="dgm-field__req">required</span>
        </span>
        <input
          className="dgm-input"
          type="text"
          value={title}
          disabled={busy}
          placeholder="Thrifted oak desk"
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      <div className="dgm-field">
        <div className="dgm-field__row">
          <span className="dgm-field__label">Categories</span>
          <span className="dgm-field__meta">
            {categories.length}/{MAX_CATALOG_CATEGORIES}
          </span>
        </div>
        <div className="dgm-chip-row">
          {CATALOG_CATEGORY_DEFS.map((c) => {
            const on = categories.includes(c.slug);
            const locked = !on && categories.length >= MAX_CATALOG_CATEGORIES;
            return (
              <button
                key={c.slug}
                type="button"
                className={`dgm-chip${on ? ' is-active' : ''}`}
                disabled={busy || locked}
                onClick={() => setCategories((cur) => toggleCatalogCategory(cur, c.slug))}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="dgm-field">
        <span className="dgm-field__label">Real size, inches</span>
        <div className="dgm-dims">
          {(
            [
              ['Width', widthIn, setWidthIn],
              ['Height', heightIn, setHeightIn],
              ['Depth', depthIn, setDepthIn],
            ] as const
          ).map(([label, value, set]) => (
            <label key={label} className="dgm-dim">
              <span className="dgm-dim__label">{label}</span>
              <input
                className="dgm-input"
                type="number"
                min={0.01}
                step="any"
                value={value}
                disabled={busy}
                onChange={(e) => set(e.target.value)}
              />
            </label>
          ))}
        </div>
        <p className="dgm-field__hint">
          Measured from the model — correct it against the real piece.
        </p>
      </div>

      {activeRoute === 'upload' ? (
        <>
          <label className="dgm-field">
            <span className="dgm-field__label">Describe it</span>
            <textarea
              className="dgm-input dgm-input--area"
              value={description}
              disabled={busy}
              rows={2}
              placeholder="Optional notes for the library card."
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="dgm-field">
            <span className="dgm-field__label">Clearance (optional)</span>
            <input
              className="dgm-input"
              type="number"
              min={0}
              step="any"
              value={clearanceIn}
              disabled={busy}
              placeholder="Walking room in front"
              onChange={(e) => setClearanceIn(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="dgm-toggle-card"
            aria-pressed={listInGallery}
            disabled={busy}
            onClick={() => setListInGallery((v) => !v)}
          >
            <span className="dgm-toggle-card__copy">
              <span className="dgm-toggle-card__title">Share in community gallery</span>
              <span className="dgm-toggle-card__hint">Off by default — only you see it.</span>
            </span>
            <span className={`dgm-toggle${listInGallery ? ' is-on' : ''}`} aria-hidden />
          </button>
        </>
      ) : null}

      {isAdmin && showMetadata ? (
        <div className="dgm-import-admin">
          <button
            type="button"
            className="dgm-toggle-card"
            aria-pressed={addToChecklist}
            disabled={busy}
            onClick={() => setAddToChecklist((v) => !v)}
          >
            <span className="dgm-toggle-card__copy">
              <span className="dgm-toggle-card__title">Also add to checklist</span>
            </span>
            <span className={`dgm-toggle${addToChecklist ? ' is-on' : ''}`} aria-hidden />
          </button>
          {addToChecklist ? (
            <div className="dgm-import-admin__fields">
              <label className="dgm-field">
                <span className="dgm-field__label">Checklist subcategory</span>
                <select
                  className="dgm-input"
                  value={checklistCategoryId}
                  disabled={busy}
                  onChange={(e) => setChecklistCategoryId(e.target.value)}
                >
                  <option value="">Select subcategory…</option>
                  {checklistLeafOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dgm-field">
                <span className="dgm-field__label">Affiliate URL</span>
                <input
                  className="dgm-input"
                  type="url"
                  value={checklistAffiliateUrl}
                  disabled={busy}
                  placeholder="https://…"
                  onChange={(e) => setChecklistAffiliateUrl(e.target.value)}
                />
              </label>
              <label className="dgm-field">
                <span className="dgm-field__label">Price (USD)</span>
                <input
                  className="dgm-input"
                  type="text"
                  value={checklistPriceDollars}
                  disabled={busy}
                  placeholder="29.99"
                  onChange={(e) => setChecklistPriceDollars(e.target.value)}
                />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}

      {formError ? <p className="dgm-import-error">{formError}</p> : null}
    </div>
  );

  const renderRoutePicker = () => (
    <div className="dgm-import-routes">
      <button type="button" className="dgm-import-route dgm-import-route--primary" onClick={() => pickRoute('photo')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M4 8.5A2 2 0 0 1 6 6.5h1.5l1-2h5l1 2H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
          <circle cx="12" cy="12.5" r="3.2" />
        </svg>
        <span className="dgm-import-route__copy">
          <span className="dgm-import-route__title">Take a photo</span>
          <span className="dgm-import-route__sub">Point at the real thing — we make the 3D model</span>
        </span>
      </button>
      <button type="button" className="dgm-import-route" onClick={() => pickRoute('poster')}>
        <span className="dgm-import-route__icon" aria-hidden />
        <span className="dgm-import-route__copy">
          <span className="dgm-import-route__title">Make a poster</span>
          <span className="dgm-import-route__sub">From a photo — flat, sized in inches</span>
        </span>
      </button>
      <button type="button" className="dgm-import-route" onClick={() => pickRoute('upload')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M12 16V4" />
          <path d="M8 8l4-4 4 4" />
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        <span className="dgm-import-route__copy">
          <span className="dgm-import-route__title">Upload a .glb file</span>
          <span className="dgm-import-route__sub">From Files or iCloud Drive · up to 75 MB</span>
        </span>
      </button>
      <p className="dgm-note">
        Sizing in inches, mesh cleanup, materials fixed for room light, and a thumbnail. You add a
        name and one to three categories.
      </p>
    </div>
  );

  const renderPhotoStep = () => (
    <div className="dgm-import-form">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="dgm-sr-only"
        onChange={(e) => {
          onPhotoFile(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="dgm-sr-only"
        onChange={(e) => {
          onPhotoFile(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />

      {!photoJob.imageFile ? (
        <>
          <div className="dgm-photo-frame" aria-hidden>
            {imagePreviewUrl ? (
              <img src={imagePreviewUrl} alt="" className="dgm-photo-frame__img" />
            ) : null}
            <div className="dgm-photo-frame__guide" />
            <span className="dgm-photo-frame__hint">one object · plain background · fill the frame</span>
          </div>
          <div className="dgm-photo-actions">
            <button
              type="button"
              className="dgm-btn dgm-btn--primary"
              onClick={() => cameraInputRef.current?.click()}
            >
              Take photo
            </button>
            <button
              type="button"
              className="dgm-btn"
              onClick={() => libraryInputRef.current?.click()}
            >
              Library
            </button>
          </div>
        </>
      ) : (
        <>
          {photoJob.generating || fileReady ? (
            imagePreviewUrl ? (
              <div className="dgm-photo-preview">
                <img src={imagePreviewUrl} alt="" />
              </div>
            ) : null
          ) : null}

          {photoJob.generating ? (
            <div className="dgm-gen-card">
              <div className="dgm-gen-card__row">
                <span className="dgm-gen-card__spin" aria-hidden />
                <span className="dgm-gen-card__label">
                  {photoJob.status ?? 'Generating 3D'} · {photoJob.elapsedSec}s
                </span>
              </div>
              <div className="dgm-gen-card__bar">
                <span className="dgm-gen-card__bar-fill" />
              </div>
              <p className="dgm-gen-card__hint">
                One to two minutes. Leave this screen and keep designing — we&apos;ll drop it into
                Yours when it lands.
              </p>
              <button
                type="button"
                className="dgm-chip"
                onClick={() => {
                  photoJobAbortRef.current?.abort();
                  patchPhotoJob({ generating: false, phase: 'idle', status: null });
                  stopPhotoJobElapsed();
                }}
              >
                Cancel generation
              </button>
            </div>
          ) : !fileReady ? (
            <>
              <PhotoSubjectPrep
                imageFile={photoJob.imageFile}
                disabled={busy}
                onPreparedChange={(f) => patchPhotoJob({ preparedFile: f })}
              />
              <button
                type="button"
                className="dgm-chip"
                disabled={busy}
                onClick={() =>
                  patchPhotoJob({
                    imageFile: null,
                    preparedFile: null,
                    glbFile: null,
                    error: null,
                  })
                }
              >
                Use a different photo
              </button>
              {photoJob.error ? <p className="dgm-import-error">{photoJob.error}</p> : null}
            </>
          ) : null}

          {showMetadata ? renderMetadataForm() : null}
        </>
      )}
    </div>
  );

  const renderPosterStep = () => (
    <div className="dgm-import-form">
      <input
        ref={posterInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="dgm-sr-only"
        disabled={busy}
        onChange={(e) => {
          setPosterImageFile(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />

      <div className="dgm-field">
        <span className="dgm-field__label">
          <span className="dgm-step">1 ·</span> Print size
        </span>
        <div className="dgm-poster-sizes">
          {POSTER_SIZES.map((s, i) => (
            <button
              key={s.label}
              type="button"
              className={`dgm-poster-size${posterSizeIdx === i ? ' is-active' : ''}`}
              disabled={busy}
              onClick={() => {
                setPosterSizeIdx(i);
                setWidthIn(s.widthIn);
                setHeightIn(s.heightIn);
                setDepthIn('0.25');
              }}
            >
              <span className="dgm-poster-size__label">{s.label}</span>
              <span className="dgm-poster-size__dims">
                {s.widthIn}×{s.heightIn}″
              </span>
            </button>
          ))}
        </div>
        <p className="dgm-field__hint">Size first — it locks the crop shape. 0.25″ thick.</p>
      </div>

      <div className="dgm-field">
        <div className="dgm-field__row">
          <span className="dgm-field__label">
            <span className="dgm-step">2 ·</span> Frame it
          </span>
          <span className="dgm-field__meta">{posterAspect.toFixed(2)} ratio</span>
        </div>
        {!posterImageFile ? (
          <button
            type="button"
            className="dgm-btn dgm-btn--block"
            disabled={busy}
            onClick={() => posterInputRef.current?.click()}
          >
            Choose image
          </button>
        ) : null}
        {posterPreviewUrl ? (
          <PosterImageCrop
            imageUrl={posterPreviewUrl}
            aspect={posterAspect}
            disabled={busy}
            onCropped={setPosterCroppedBlob}
          />
        ) : null}
        <p className="dgm-field__hint">Drag to pan, pinch to zoom. Outside the frame is cut.</p>
      </div>

      {posterError ? <p className="dgm-import-error">{posterError}</p> : null}
      {showMetadata ? renderMetadataForm() : null}
    </div>
  );

  const renderUploadStep = () => (
    <div className="dgm-import-form">
      <input
        ref={glbInputRef}
        type="file"
        accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
        className="dgm-sr-only"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          setFile(f);
          if (f && !title.trim()) setTitle(f.name.replace(/\.(glb|gltf)$/i, ''));
          e.target.value = '';
        }}
      />
      {activeFile ? (
        <div className="dgm-file-row">
          <div className="dgm-file-row__copy">
            <span className="dgm-file-row__name">{activeFile.name}</span>
            <span className="dgm-file-row__meta">
              {[formatBytes(activeFile.size), decimating ? 'optimizing…' : uploadFile ? 'ready' : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
          <button type="button" className="dgm-chip" disabled={busy} onClick={() => glbInputRef.current?.click()}>
            Replace
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="dgm-drop-zone"
          disabled={busy}
          onClick={() => glbInputRef.current?.click()}
        >
          <span className="dgm-drop-zone__title">Choose a .glb or .gltf</span>
          <span className="dgm-drop-zone__hint">Up to 75 MB</span>
        </button>
      )}
      {decimationError ? <p className="dgm-import-error">{decimationError}</p> : null}
      {showMetadata ? renderMetadataForm() : null}
    </div>
  );

  return (
    <MobileSheet
      kind="import"
      title={sheetTitle(activeRoute)}
      onClose={handleClose}
      hideTitle
      bodyClassName="dgm-import-body"
    >
      <div className="dgm-sheet-custom-head">
        <div className="dgm-sheet-custom-head__copy">
          <span className="dgm-sheet-eyebrow">{sheetEyebrow(activeRoute)}</span>
          <h2 className="dgm-sheet-custom-head__title">{sheetTitle(activeRoute)}</h2>
        </div>
      </div>

      {!activeRoute
        ? renderRoutePicker()
        : activeRoute === 'photo'
          ? renderPhotoStep()
          : activeRoute === 'poster'
            ? renderPosterStep()
            : renderUploadStep()}

      <div className="dgm-import-foot">
        <button type="button" className="dgm-foot-btn" disabled={submitting || decimating || creatingPoster} onClick={handleBack}>
          {activeRoute ? 'Back' : 'Cancel'}
        </button>
        <button
          type="button"
          className={`dgm-foot-btn dgm-foot-btn--primary${primaryDisabled ? ' is-disabled' : ''}`}
          disabled={primaryDisabled}
          onClick={onPrimary}
        >
          {primaryLabel}
        </button>
      </div>
    </MobileSheet>
  );
}
