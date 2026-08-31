import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  CATALOG_CATEGORY_DEFS,
  MAX_CATALOG_CATEGORIES,
  toggleCatalogCategory,
  type CatalogCategorySlug,
} from '../../lib/catalogCategories';
import type { ChecklistCategoryWithProducts } from '../../lib/dormChecklist';
import { fetchAdminShoppingCatalog } from '../../lib/shoppingCatalog';
import {
  adminLeafCategories,
  createChecklistProductFromCatalog,
  parsePriceDollarsToCents,
} from '../../lib/shoppingCatalogAdmin';
import { TRELLIS_GENERATE_URL, trellisUsesRemoteUrl } from '../../lib/trellisApi';
import { ImageFileField } from '../ImageFileField';
import { PosterImageCrop } from '../PosterImageCrop';
import type { CatalogModel, ImportRoute } from './chromeTypes';
import {
  buildPosterGlb,
  prepareGlbFile,
  runPhotoGenerate,
  submitCatalogImport,
  type GeneratePhase,
} from './importLogic';

export interface ImportFlowProps {
  open: boolean;
  route: ImportRoute;
  onRoute: (r: ImportRoute) => void;
  onClose: () => void;
  isAdmin?: boolean;
  /** Compact / phone layout — route-first cards when route is null. */
  compact?: boolean;
  onComplete?: (model: CatalogModel) => void;
}

const ROUTES: {
  id: Exclude<ImportRoute, null>;
  title: string;
  sub: string;
  body: string;
}[] = [
  {
    id: 'upload',
    title: 'Upload a model',
    sub: '.glb / .gltf',
    body: 'Bring a finished 3D model. We optimize the mesh before it lands in your library.',
  },
  {
    id: 'photo',
    title: 'From a photo',
    sub: 'we generate the 3D',
    body: 'Generate a rough 3D piece from one clear photo. Best for simple furniture.',
  },
  {
    id: 'poster',
    title: 'Poster or print',
    sub: 'flat, from an image',
    body: 'Crop an image onto a thin board: art, calendars, or cork boards.',
  },
];

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function positiveInches(value: string): boolean {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

type CheckItem = { done: boolean; label: string; note: string; optional?: boolean };

export function ImportFlow({
  open,
  route,
  onRoute,
  onClose,
  isAdmin = false,
  compact = false,
  onComplete,
}: ImportFlowProps) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [decimating, setDecimating] = useState(false);
  const [decimationError, setDecimationError] = useState<string | null>(null);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatePhase, setGeneratePhase] = useState<GeneratePhase>('idle');
  const [generateStatus, setGenerateStatus] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const generateAbortRef = useRef<AbortController | null>(null);
  const activeJobIdRef = useRef<string | null>(null);

  const [posterImageFile, setPosterImageFile] = useState<File | null>(null);
  const [posterPreviewUrl, setPosterPreviewUrl] = useState<string | null>(null);
  const [posterCroppedBlob, setPosterCroppedBlob] = useState<Blob | null>(null);
  const [creatingPoster, setCreatingPoster] = useState(false);
  const [posterError, setPosterError] = useState<string | null>(null);

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

  const busy = submitting || generating || decimating || creatingPoster;

  const reset = () => {
    setFile(null);
    setUploadFile(null);
    setDecimating(false);
    setDecimationError(null);
    setImageFile(null);
    setGenerating(false);
    setGeneratePhase('idle');
    setGenerateStatus(null);
    setGenerateError(null);
    setElapsedSec(0);
    generateAbortRef.current?.abort();
    generateAbortRef.current = null;
    activeJobIdRef.current = null;
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
  };

  useEffect(() => {
    if (!open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
      setUploadFile(null);
      setDecimating(false);
      setDecimationError(null);
      return;
    }
    let cancelled = false;
    setUploadFile(null);
    setDecimationError(null);
    setDecimating(true);
    void prepareGlbFile(file)
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
  }, [file]);

  if (!open) return null;

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const pickRoute = (id: Exclude<ImportRoute, null>) => {
    onRoute(id);
    setFormError(null);
    setGenerateError(null);
    setPosterError(null);
    if (id === 'poster' && widthIn === '24' && heightIn === '24' && depthIn === '24') {
      setWidthIn('18');
      setHeightIn('24');
      setDepthIn('0.25');
    }
  };

  const handleGenerate = async () => {
    if (!userId || !imageFile || generating) return;
    setGenerateError(null);
    generateAbortRef.current?.abort();
    const abort = new AbortController();
    generateAbortRef.current = abort;
    setElapsedSec(0);
    setGenerateStatus('Waking Trellis…');
    setGeneratePhase('generating');
    setGenerating(true);
    try {
      const { glbFile, jobId } = await runPhotoGenerate(
        imageFile,
        userId,
        abort.signal,
        (message) => {
          setGenerateStatus(message);
          if (message.toLowerCase().includes('download')) setGeneratePhase('downloading');
        },
      );
      activeJobIdRef.current = jobId;
      setFile(glbFile);
      onRoute('upload');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setGenerateError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
      setGeneratePhase('idle');
      setGenerateStatus(null);
      if (generateAbortRef.current === abort) generateAbortRef.current = null;
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
      onRoute('upload');
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
    setFormError(null);
    if (!file) {
      setFormError('Choose a .glb file, generate from a photo, or create a poster.');
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
        file,
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
        priorJobId: activeJobIdRef.current,
      });
      if (addToChecklist && isAdmin && checklistCategoryId) {
        const cover =
          checklistCoverFile ?? imageFile ?? posterImageFile ?? null;
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
      activeJobIdRef.current = null;
      onComplete?.(model);
      reset();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  };

  const onPickFile = (f: File | null) => {
    setFile(f);
    if (f && !title.trim()) {
      setTitle(f.name.replace(/\.(glb|gltf)$/i, ''));
    }
  };

  const posterAspect = (() => {
    const pw = Number(widthIn);
    const ph = Number(heightIn);
    if (Number.isFinite(pw) && Number.isFinite(ph) && pw > 0 && ph > 0) return pw / ph;
    return 18 / 24;
  })();

  // Desktop: null route → upload. Compact: null → route picker cards.
  const showRoutePicker = compact && route == null;
  const activeRoute = route ?? 'upload';
  const checklistLeafOptions = adminLeafCategories(checklistCategories);

  const fileReady = Boolean(file && uploadFile && !decimating);
  const assetReady =
    activeRoute === 'upload'
      ? fileReady
      : activeRoute === 'photo'
        ? Boolean(imageFile)
        : Boolean(posterCroppedBlob);
  const nameOk = title.trim().length > 0;
  const catsOk = categories.length >= 1 && categories.length <= MAX_CATALOG_CATEGORIES;
  const dimsOk =
    positiveInches(widthIn) && positiveInches(heightIn) && positiveInches(depthIn);

  const checks: CheckItem[] =
    activeRoute === 'photo'
      ? [
          {
            done: Boolean(imageFile),
            label: 'One photo, one object',
            note: 'jpg, png or webp. Paste works too.',
          },
          {
            done: Boolean(imageFile),
            label: 'Shot straight on',
            note: 'Whole piece in frame, plain background, even light.',
          },
          {
            done: fileReady,
            label: 'Generation finishes',
            note: 'One to two minutes. You can leave and come back.',
          },
          {
            done: false,
            label: 'Then name, categories and size',
            note: 'The generated model finishes on the Upload tab.',
          },
        ]
      : activeRoute === 'poster'
        ? [
            {
              done: dimsOk,
              label: 'Print size first',
              note: 'It locks the crop shape. 0.25″ thick, hangs flat.',
            },
            {
              done: Boolean(posterImageFile),
              label: 'An image',
              note: 'jpg, png or webp.',
            },
            {
              done: Boolean(posterCroppedBlob),
              label: 'A crop inside the frame',
              note: 'Pan and zoom. Anything outside the frame is cut.',
            },
            {
              done: false,
              label: 'Name and categories',
              note: 'Filled in on the Upload tab before it saves.',
            },
          ]
        : [
            {
              done: fileReady,
              label: 'A .glb or .gltf file',
              note: 'Up to 75 MB. Other formats need converting first.',
            },
            {
              done: nameOk,
              label: 'A name',
              note: 'No brand names or profanity. We check both name and description.',
            },
            {
              done: catsOk,
              label: '1–3 categories',
              note: 'Decides where it shows up when people filter the library.',
            },
            {
              done: dimsOk,
              label: 'Width, height and depth in inches',
              note: 'Positive numbers. We read them from the file; you confirm.',
            },
            {
              done: true,
              label: 'Clearance is optional',
              note: 'Non-negative inches, or empty for the room default.',
              optional: true,
            },
          ];

  const weHandle =
    activeRoute === 'photo'
      ? [
          'We track the job. You can close this and keep designing.',
          'Generated meshes skip polygon reduction; materials and normals are fixed instead.',
          'The result lands in Your models, private until you share it.',
        ]
      : activeRoute === 'poster'
        ? [
            'The crop becomes a texture on a flat GLB with 0.25″ depth.',
            'It is tagged "poster" and filed under Decor & Art.',
            'Wall-mount is on by default, so it snaps flat to the nearest wall.',
          ]
        : [
            'Meshes over 50K triangles are reduced automatically (.glb only; .gltf goes up as-is).',
            'Materials are normalized so imports respond to room light; broken normals are repaired.',
            'A thumbnail is rendered for the library card.',
            'Size is measured from the file bounds and converted to inches.',
          ];

  const reqTitle =
    activeRoute === 'photo'
      ? 'What a photo needs'
      : activeRoute === 'poster'
        ? 'How a poster is made'
        : 'Before it can be added';

  const canSave =
    activeRoute === 'upload' &&
    fileReady &&
    nameOk &&
    catsOk &&
    dimsOk &&
    !busy &&
    Boolean(userId);

  const gateNote =
    activeRoute === 'upload'
      ? canSave
        ? 'Ready to add.'
        : !assetReady
          ? 'Drop a model file to continue.'
          : !nameOk
            ? 'Give it a name.'
            : !catsOk
              ? 'Pick 1–3 categories.'
              : !dimsOk
                ? 'Confirm width, height and depth.'
                : !userId
                  ? 'Sign in to save.'
                  : busy
                    ? 'Working…'
                    : 'Finish the required fields.'
      : activeRoute === 'photo'
        ? generating
          ? `Generating · ${elapsedSec}s`
          : 'Generate a model, then finish details on Upload.'
        : creatingPoster
          ? 'Building poster…'
          : 'Build the poster GLB, then finish details on Upload.';

  const renderTabs = () => (
    <div className="dg-tabs dg-tabs--underline" role="tablist" aria-label="Import route">
      {ROUTES.map((r) => (
        <button
          key={r.id}
          type="button"
          role="tab"
          aria-selected={activeRoute === r.id}
          className={`dg-tabs__btn${activeRoute === r.id ? ' is-active' : ''}`}
          disabled={busy}
          onClick={() => pickRoute(r.id)}
        >
          <span className="dg-import-tab__title">{r.title}</span>
          <span className="dg-import-tab__sub">{r.sub}</span>
        </button>
      ))}
    </div>
  );

  const renderUploadForm = () => (
    <div className="dg-import-form">
      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
        disabled={busy}
        className="dg-import-file-input"
        onChange={(e) => {
          onPickFile(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />

      {file ? (
        <div className="dg-import-file">
          <div className="dg-import-file__thumb" aria-hidden />
          <div className="dg-import-file__copy">
            <span className="dg-import-file__name">{file.name}</span>
            <span className="dg-import-file__meta">
              {[formatBytes(file.size), decimating ? 'optimizing…' : uploadFile ? 'optimized' : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <span className="dg-import-file__hint">
              {decimationError
                ? decimationError
                : uploadFile
                  ? 'Optimized and lit for the room.'
                  : decimating
                    ? 'Reducing polygons and fixing materials…'
                    : 'Waiting for mesh preparation…'}
            </span>
          </div>
          <button
            type="button"
            className="dg-chip"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            Replace
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="dg-import-drop"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="dg-import-drop__title">Drop a .glb or .gltf</span>
          <span className="dg-import-drop__hint">or click to browse · up to 75 MB</span>
        </button>
      )}

      <label className="dg-import-field">
        <span className="dg-import-field__label">
          Name it <span className="dg-import-field__req">·</span>{' '}
          <span className="dg-row__meta">required</span>
        </span>
        <input
          className="dg-import-input"
          type="text"
          value={title}
          disabled={busy}
          placeholder="Thrifted oak desk"
          onChange={(e) => setTitle(e.target.value)}
        />
        <span className="dg-import-field__hint">
          Shown to anyone who browses it. No brand names or profanity. We check.
        </span>
      </label>

      <label className="dg-import-field">
        <span className="dg-import-field__label">
          Describe it <span className="dg-row__meta">optional</span>
        </span>
        <textarea
          className="dg-import-input dg-import-input--area"
          value={description}
          disabled={busy}
          rows={2}
          placeholder="Scanned from the desk in my room. 48″ wide, one drawer."
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <div className="dg-import-field">
        <div className="dg-row dg-row--between" style={{ padding: 0, minHeight: 0 }}>
          <span className="dg-import-field__label">
            Where it belongs <span className="dg-row__meta">1–3 required</span>
          </span>
          <span className="dg-row__meta" style={{ color: 'var(--accent-text)' }}>
            {categories.length}/{MAX_CATALOG_CATEGORIES}
          </span>
        </div>
        <div className="dg-chip-row" style={{ flexWrap: 'wrap' }}>
          {CATALOG_CATEGORY_DEFS.map((c) => {
            const on = categories.includes(c.slug);
            const locked = !on && categories.length >= MAX_CATALOG_CATEGORIES;
            return (
              <button
                key={c.slug}
                type="button"
                className={`dg-chip${on ? ' is-active' : ''}`}
                disabled={busy || locked}
                onClick={() => setCategories((cur) => toggleCatalogCategory(cur, c.slug))}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="dg-import-field">
        <div className="dg-row dg-row--between" style={{ padding: 0, minHeight: 0 }}>
          <span className="dg-import-field__label">Real size, in inches</span>
          <span className="dg-row__meta">read from the file; check it</span>
        </div>
        <div className="dg-import-dims">
          {(
            [
              ['Width', widthIn, setWidthIn, false],
              ['Height', heightIn, setHeightIn, false],
              ['Depth', depthIn, setDepthIn, false],
              ['Clearance', clearanceIn, setClearanceIn, true],
            ] as const
          ).map(([label, value, set, optional]) => (
            <label key={label} className="dg-import-dim">
              <span className="dg-import-dim__label">{label}</span>
              <input
                className={`dg-import-input${optional ? ' dg-import-input--optional' : ''}`}
                type="number"
                min={optional ? 0 : 0.01}
                step="any"
                value={value}
                placeholder={optional ? '' : undefined}
                disabled={busy}
                onChange={(e) => set(e.target.value)}
              />
            </label>
          ))}
        </div>
        <span className="dg-import-field__hint">
          Clearance is the walking room this piece needs in front of it. Leave it empty and we
          use the room default.
        </span>
      </div>

      <button
        type="button"
        className="dg-toggle-card"
        aria-pressed={listInGallery}
        disabled={busy}
        onClick={() => setListInGallery((v) => !v)}
      >
        <span className="dg-toggle-card__copy">
          <span className="dg-toggle-card__title">Share it in the community gallery</span>
          <span className="dg-toggle-card__hint">
            Others can browse, like and place it. Keep it off and only you see it.
          </span>
        </span>
        <span className={`dg-toggle${listInGallery ? ' is-on' : ''}`} aria-hidden />
      </button>

      {isAdmin ? (
        <div className="dg-import-admin">
          <button
            type="button"
            className="dg-toggle-card"
            aria-pressed={addToChecklist}
            disabled={busy}
            onClick={() => setAddToChecklist((v) => !v)}
          >
            <span className="dg-toggle-card__copy">
              <span className="dg-toggle-card__title">Also add to checklist</span>
              <span className="dg-toggle-card__hint">
                Admin only. Publish into the shopping checklist when this saves.
              </span>
            </span>
            <span className={`dg-toggle${addToChecklist ? ' is-on' : ''}`} aria-hidden />
          </button>
          {addToChecklist ? (
            <div className="dg-import-admin__fields">
              <label className="dg-import-field">
                <span className="dg-import-field__label">Checklist subcategory</span>
                <select
                  className="dg-import-input"
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
              <label className="dg-import-field">
                <span className="dg-import-field__label">Affiliate URL</span>
                <input
                  className="dg-import-input"
                  type="url"
                  value={checklistAffiliateUrl}
                  disabled={busy}
                  placeholder="https://amzn.to/… (optional)"
                  onChange={(e) => setChecklistAffiliateUrl(e.target.value)}
                />
              </label>
              <label className="dg-import-field">
                <span className="dg-import-field__label">Price (USD)</span>
                <input
                  className="dg-import-input"
                  type="text"
                  value={checklistPriceDollars}
                  disabled={busy}
                  placeholder="29.99"
                  onChange={(e) => setChecklistPriceDollars(e.target.value)}
                />
              </label>
              <label className="dg-import-field">
                <span className="dg-import-field__label">Cover image</span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={busy}
                  onChange={(e) => setChecklistCoverFile(e.target.files?.[0] ?? null)}
                />
                <span className="dg-import-field__hint">
                  {checklistCoverFile
                    ? checklistCoverFile.name
                    : imageFile
                      ? `Using generate photo: ${imageFile.name}`
                      : posterImageFile
                        ? `Using poster image: ${posterImageFile.name}`
                        : 'Optional. Uses source photo when available'}
                </span>
              </label>
              <p className="dg-note" style={{ margin: 0 }}>
                Checklist products are public. Saving with this on forces gallery visibility.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {formError ? <p className="dg-import-error">{formError}</p> : null}
    </div>
  );

  const renderPhotoForm = () => (
    <div className="dg-import-form">
      <ImageFileField
        label="Source image"
        file={imageFile}
        disabled={busy}
        onFile={setImageFile}
      />
      {trellisUsesRemoteUrl && !generating ? (
        <p className="dg-import-field__hint">Uses Trellis at {TRELLIS_GENERATE_URL}</p>
      ) : null}
      {generateError ? <p className="dg-import-error">{generateError}</p> : null}
      <div className="dg-note">
        The generated model opens on <strong>Upload a model</strong> with its size already
        measured. Give it a name and a category and it&apos;s in your library.
      </div>
    </div>
  );

  const renderPosterForm = () => (
    <div className="dg-import-form">
      <ImageFileField
        label="Poster image"
        file={posterImageFile}
        disabled={busy}
        onFile={setPosterImageFile}
      />
      {posterPreviewUrl ? (
        <PosterImageCrop
          imageUrl={posterPreviewUrl}
          aspect={posterAspect}
          disabled={busy}
          onCropped={setPosterCroppedBlob}
        />
      ) : null}
      <div className="dg-import-dims dg-import-dims--3">
        {(
          [
            ['Width', widthIn, setWidthIn],
            ['Height', heightIn, setHeightIn],
            ['Depth', depthIn, setDepthIn],
          ] as const
        ).map(([label, value, set]) => (
          <label key={label} className="dg-import-dim">
            <span className="dg-import-dim__label">{label}</span>
            <input
              className="dg-import-input"
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
      {posterError ? <p className="dg-import-error">{posterError}</p> : null}
    </div>
  );

  const sidePreview =
    activeRoute === 'photo' && imagePreviewUrl
      ? { src: imagePreviewUrl, label: 'Source photo' }
      : activeRoute === 'upload' && file
        ? null
        : activeRoute === 'poster' && posterPreviewUrl
          ? { src: posterPreviewUrl, label: 'Poster image' }
          : null;

  const renderSide = () => (
    <aside className="dg-import-check">
      <div className="dg-import-check__body">
        {generating ? (
          <div className="dg-import-progress">
            <div className="dg-import-progress__row">
              <span className="dg-import-progress__spin" aria-hidden />
              <span className="dg-import-progress__label">
                {generateStatus
                  ? `${generateStatus} · ${elapsedSec}s`
                  : generatePhase === 'downloading'
                    ? `Downloading model · ${elapsedSec}s`
                    : `Generating 3D · ${elapsedSec}s`}
              </span>
            </div>
            <p className="dg-import-progress__hint">
              Usually one to two minutes. Close this and keep designing. We&apos;ll drop it into
              Your models when it lands.
            </p>
            <button
              type="button"
              className="dg-chip"
              onClick={() => generateAbortRef.current?.abort()}
            >
              Cancel generation
            </button>
          </div>
        ) : sidePreview ? (
          <div className="dg-import-side-preview">
            <div className="dg-import-check__eyebrow">{sidePreview.label}</div>
            <img src={sidePreview.src} alt="" className="dg-import-preview" />
          </div>
        ) : file && activeRoute === 'upload' ? (
          <div className="dg-import-side-preview">
            <div className="dg-import-check__eyebrow">Model file</div>
            <div className="dg-import-file dg-import-file--side">
              <div className="dg-import-file__thumb" aria-hidden />
              <div className="dg-import-file__copy">
                <span className="dg-import-file__name">{file.name}</span>
                <span className="dg-import-file__meta">
                  {[
                    formatBytes(file.size),
                    decimating ? 'optimizing…' : uploadFile ? 'ready' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
            </div>
            <ul className="dg-import-check__list" style={{ marginTop: 14 }}>
              {checks.map((c) => (
                <li key={c.label} className={`dg-import-check__item${c.done ? ' is-done' : ''}`}>
                  <span className="dg-import-check__mark" aria-hidden>
                    {c.done ? '✓' : ''}
                  </span>
                  <span className="dg-import-check__copy">
                    <span className="dg-import-check__label">{c.label}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <div className="dg-import-check__eyebrow">{reqTitle}</div>
            <ul className="dg-import-check__list">
              {checks.map((c) => (
                <li key={c.label} className={`dg-import-check__item${c.done ? ' is-done' : ''}`}>
                  <span className="dg-import-check__mark" aria-hidden>
                    {c.done ? '✓' : ''}
                  </span>
                  <span className="dg-import-check__copy">
                    <span className="dg-import-check__label">{c.label}</span>
                    <span className="dg-import-check__note">{c.note}</span>
                  </span>
                </li>
              ))}
            </ul>
            <hr className="dg-rule" />
            <div className="dg-import-check__eyebrow">We handle</div>
            <ul className="dg-import-check__autos">
              {weHandle.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </aside>
  );

  const primaryLabel =
    activeRoute === 'photo'
      ? generating
        ? 'Generating…'
        : 'Generate 3D'
      : activeRoute === 'poster'
        ? creatingPoster
          ? 'Building…'
          : 'Build poster GLB'
        : submitting
          ? 'Saving…'
          : 'Add to library';

  const primaryDisabled =
    activeRoute === 'photo'
      ? !imageFile || !userId || generating
      : activeRoute === 'poster'
        ? busy || !posterCroppedBlob
        : !canSave;

  const onPrimary = () => {
    if (activeRoute === 'photo') void handleGenerate();
    else if (activeRoute === 'poster') void handleCreatePoster();
    else void handleSubmit();
  };

  const panelMod =
    activeRoute === 'upload' || file || imageFile || posterImageFile ? 'is-expanded' : 'is-compact';

  return (
    <div
      className="dg-import"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) handleClose();
      }}
    >
      <div
        className={`dg-import-panel ${panelMod}`}
        role="dialog"
        aria-modal="true"
        aria-label="Import a model"
      >
        <div className="dg-import-header">
          <div className="dg-import-header__copy">
            <div className="dg-import-header__eyebrow">Your models</div>
            <h1 className="dg-import-header__title">
              {showRoutePicker
                ? 'Bring a piece in'
                : activeRoute === 'photo'
                  ? 'From a photo'
                  : activeRoute === 'poster'
                    ? 'Poster or print'
                    : 'Bring a piece in'}
            </h1>
          </div>
          <button
            type="button"
            className="dg-import-header__close"
            onClick={handleClose}
            disabled={busy}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="dg-import-body">
          {showRoutePicker ? (
            <div className="dg-import-routes">
              {ROUTES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="dg-import-route"
                  onClick={() => pickRoute(r.id)}
                >
                  <span className="dg-import-route__title">{r.title}</span>
                  <span className="dg-import-route__body">{r.body}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="dg-import-layout">
              <div className="dg-import-layout__main">
                {renderTabs()}
                <div className="dg-import-layout__form">
                  {activeRoute === 'photo'
                    ? renderPhotoForm()
                    : activeRoute === 'poster'
                      ? renderPosterForm()
                      : renderUploadForm()}
                </div>
              </div>
              {renderSide()}
            </div>
          )}
        </div>

        {!showRoutePicker ? (
          <div className="dg-import-foot">
            <p className="dg-import-check__gate">{gateNote}</p>
            <div className="dg-footer-actions">
              <button type="button" className="dg-footer-btn" disabled={busy} onClick={handleClose}>
                Cancel
              </button>
              <button
                type="button"
                className="dg-footer-btn is-primary"
                disabled={primaryDisabled}
                onClick={onPrimary}
                data-grow
              >
                {primaryLabel}
              </button>
            </div>
          </div>
        ) : (
          <div className="dg-import-foot">
            <div className="dg-footer-actions">
              <button type="button" className="dg-footer-btn" onClick={handleClose}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
