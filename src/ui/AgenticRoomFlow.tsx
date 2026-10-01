import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FloorPlan } from '../lib/floorPlanGeometry';
import { formatLength, rectanglePlan } from '../lib/floorPlanGeometry';
import type { AgenticItemAsk, AgenticRoomRequest, AgenticVibeId } from '../lib/agenticRoomPrompt';
import type { AgenticFurnitureListResult } from '../lib/agenticRoomListTypes';
import { appearanceForAgenticVibe } from '../lib/agenticRoomVibe';
import { fetchFurnitureListFromCursor } from '../lib/agenticRoomCursorApi';
import {
  flattenCatalogProducts,
  formatAgenticPrice,
} from '../lib/agenticRoomResolve';
import {
  resolveAgenticList,
  type ResolvedAgenticItemWithOffers,
} from '../lib/agenticRoomResolveFromList';
import { shoppingEntriesFromResolved } from '../lib/agenticRoomApplyChecklist';
import { fetchPublishedShoppingCatalog } from '../lib/shoppingCatalog';
import { searchOffersForQuery, type AffiliateOffer } from '../lib/affiliateLinks';
import type { CuratedProduct, ShoppingListEntry } from '../lib/dormChecklist';
import { FURNITURE } from '../furniture/registry';
import { trackAffiliateClicked } from '../lib/analytics';
import {
  applySavedResolvedPicks,
  buildAgenticChecklistDraft,
  defaultChecklistTitle,
  deleteAgenticChecklistDraft,
  formatSavedChecklistDate,
  loadSavedAgenticChecklists,
  saveAgenticChecklistDraft,
  type SavedAgenticChecklistDraft,
  type SavedAgenticResolvedPick,
} from '../lib/agenticRoomSavedChecklists';
import { DEFAULT_ENVIRONMENT, type RoomEnvironment } from '../store';
import { Banner, Button, Field, Input, Spinner } from './kit';

export interface AgenticRoomConfirmPayload {
  plan: FloorPlan;
  environment: RoomEnvironment;
  shoppingList: ShoppingListEntry[];
  budgetCents?: number | null;
  request: AgenticRoomRequest;
}

interface AgenticRoomFlowProps {
  disabled?: boolean;
  onConfirm: (payload: AgenticRoomConfirmPayload) => void | Promise<void>;
  onBack: () => void;
}

const EXAMPLE_PROMPT =
  '12×10 dorm bedroom, gothic theme, under $800 — queen bed, corner desk, shelves';

const PROMPT_HINTS = [
  'Room size — e.g. 10×12, 12 by 10 feet',
  'Room type — dorm, bedroom, studio, home office',
  'Theme or style — gothic, minimalist, cozy, sage',
  'Budget — under $500, $800 total',
  'Must-haves — any items you already know you want',
];

const VIBE_OPTIONS: { id: AgenticVibeId; label: string }[] = [
  { id: 'warm', label: 'Warm' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'studio', label: 'Studio' },
  { id: 'moody', label: 'Moody' },
  { id: 'sage', label: 'Sage' },
];

type GeneratePhase = 'idle' | 'sending' | 'waiting';

function trackOfferClick(offer: AffiliateOffer, productId?: string) {
  trackAffiliateClicked({
    retailer: offer.retailer,
    product_id: productId,
    is_price_approximate: offer.approximate,
    source: 'agentic_room',
  });
}

function SearchLinks({ query }: { query: string }) {
  const offers = searchOffersForQuery(query);
  if (offers.length === 0) return null;
  return (
    <div className="agentic-room-item__meta agentic-room-item__meta--links">
      {offers.map((offer) => (
        <a
          key={offer.url}
          href={offer.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackOfferClick(offer)}
        >
          {offer.label}
        </a>
      ))}
    </div>
  );
}

function FurnitureListRow({
  item,
  index,
  disabled,
  onQuery,
  onQty,
  onRemove,
}: {
  item: AgenticItemAsk;
  index: number;
  disabled?: boolean;
  onQuery: (query: string) => void;
  onQty: (qty: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="agentic-room-item agentic-room-item--list">
      <div className="agentic-room-item__main">
        <div className="agentic-room-item__copy agentic-room-item__copy--full">
          <Field label={`Item ${index + 1}`}>
            <Input
              value={item.query}
              disabled={disabled}
              onChange={(e) => onQuery(e.target.value)}
              aria-label={`Furniture item ${index + 1}`}
            />
          </Field>
          <SearchLinks query={item.query} />
        </div>
      </div>
      <div className="agentic-room-item__actions">
        {item.estimatedCents != null ? (
          <span className="agentic-room-item__estimate">
            ~{formatAgenticPrice(item.estimatedCents)}
          </span>
        ) : null}
        <label className="agentic-room-item__qty">
          Qty
          <Input
            type="number"
            min={1}
            max={99}
            value={String(item.qty)}
            disabled={disabled}
            onChange={(e) => onQty(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <Button size="sm" variant="outline" disabled={disabled} onClick={onRemove}>
          Remove
        </Button>
      </div>
    </div>
  );
}

function ProductRow({
  item,
  disabled,
  onSwap,
  onQty,
  onRemove,
}: {
  item: ResolvedAgenticItemWithOffers;
  disabled?: boolean;
  onSwap: (productId: string) => void;
  onQty: (qty: number) => void;
  onRemove: () => void;
}) {
  const product = item.product;
  const label =
    product?.name ?? (item.builtinKind ? FURNITURE[item.builtinKind].label : item.query);
  const price = product ? formatAgenticPrice(product.priceCents) : '—';

  return (
    <div className="agentic-room-item">
      <div className="agentic-room-item__main">
        {product?.imageUrl ? (
          <img src={product.imageUrl} alt="" className="agentic-room-item__img" />
        ) : (
          <div className="agentic-room-item__img agentic-room-item__img--empty" aria-hidden />
        )}
        <div className="agentic-room-item__copy">
          <div className="agentic-room-item__query">You asked for: {item.query}</div>
          <div className="agentic-room-item__name">{label}</div>
          <div className="agentic-room-item__meta">
            <span>{price}</span>
            {product?.affiliateUrl ? (
              <a
                href={product.affiliateUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  trackOfferClick(
                    {
                      label: 'Shop',
                      url: product.affiliateUrl,
                      approximate: false,
                      retailer: product.retailer,
                    },
                    product.id,
                  )
                }
              >
                Shop at {product.retailer?.trim() || 'retailer'}
              </a>
            ) : null}
            {!product?.affiliateUrl ? <SearchLinks query={item.query} /> : null}
          </div>
          {item.warnings.map((w) => (
            <p key={w} className="agentic-room-item__warn">
              {w}
            </p>
          ))}
        </div>
      </div>
      <div className="agentic-room-item__actions">
        {item.alternates.length > 0 ? (
          <select
            className="agentic-room-item__swap"
            disabled={disabled}
            value={product?.id ?? ''}
            onChange={(e) => onSwap(e.target.value)}
            aria-label={`Swap match for ${item.query}`}
          >
            {product ? <option value={product.id}>{product.name}</option> : null}
            {item.alternates.map((alt) => (
              <option key={alt.id} value={alt.id}>
                {alt.name} ({formatAgenticPrice(alt.priceCents)})
              </option>
            ))}
          </select>
        ) : null}
        <label className="agentic-room-item__qty">
          Qty
          <Input
            type="number"
            min={1}
            max={99}
            value={String(item.qty)}
            disabled={disabled}
            onChange={(e) => onQty(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <Button size="sm" variant="outline" disabled={disabled} onClick={onRemove}>
          Remove
        </Button>
      </div>
    </div>
  );
}

export function AgenticRoomFlow({ disabled, onConfirm, onBack }: AgenticRoomFlowProps) {
  const [prompt, setPrompt] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [products, setProducts] = useState<CuratedProduct[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<AgenticFurnitureListResult | null>(null);
  const [items, setItems] = useState<AgenticItemAsk[]>([]);
  const [generatePhase, setGeneratePhase] = useState<GeneratePhase>('idle');
  const [generating, setGenerating] = useState(false);
  const [request, setRequest] = useState<AgenticRoomRequest | null>(null);
  const [resolved, setResolved] = useState<ResolvedAgenticItemWithOffers[]>([]);
  const [overBudget, setOverBudget] = useState(false);
  const [totalCents, setTotalCents] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [savedDrafts, setSavedDrafts] = useState<SavedAgenticChecklistDraft[]>(() =>
    loadSavedAgenticChecklists(),
  );
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [activeDraftCreatedAt, setActiveDraftCreatedAt] = useState<string | null>(null);
  const [saveTitle, setSaveTitle] = useState('');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savedPicks, setSavedPicks] = useState<SavedAgenticResolvedPick[] | undefined>();

  const itemsKey = useMemo(
    () => items.map((i) => `${i.query.trim().toLowerCase()}:${i.qty}`).join('|'),
    [items],
  );

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    void fetchPublishedShoppingCatalog()
      .then((cats) => {
        if (cancelled) return;
        setProducts(flattenCatalogProducts(cats));
        setCatalogError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setCatalogError(e instanceof Error ? e.message : 'Could not load product catalog');
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runGenerate = useCallback(async () => {
    setParseError(null);
    setGenerating(true);
    setGeneratePhase('sending');
    try {
      setGeneratePhase('waiting');
      const next = await fetchFurnitureListFromCursor(prompt);
      if (next.items.length === 0) {
        setParseError(next.warnings[0] ?? 'No furniture items returned.');
        setResult(null);
        setItems([]);
        return;
      }
      setResult(next);
      setItems(next.items);
      setSavedPicks(undefined);
      setActiveDraftId(null);
      setActiveDraftCreatedAt(null);
      setSaveMessage(null);
      setSaveTitle(defaultChecklistTitle(prompt, next));
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Could not generate list');
      setResult(null);
      setItems([]);
    } finally {
      setGenerating(false);
      setGeneratePhase('idle');
    }
  }, [prompt]);

  useEffect(() => {
    if (!result || catalogLoading || items.length === 0) return;
    const listInput: AgenticFurnitureListResult = { ...result, items };
    const matchResult = resolveAgenticList(listInput, products);
    const withPicks = applySavedResolvedPicks(matchResult.items, savedPicks, products);
    const totalCents = withPicks.reduce((sum, it) => {
      if (!it.product?.priceCents) return sum;
      return sum + it.product.priceCents * it.qty;
    }, 0);
    const overBudget =
      matchResult.request.budgetCents != null &&
      totalCents > matchResult.request.budgetCents &&
      totalCents > 0;
    setRequest(matchResult.request);
    setResolved(withPicks);
    setOverBudget(overBudget);
    setTotalCents(totalCents);
  }, [result, catalogLoading, products, itemsKey, savedPicks]);

  const updateItem = useCallback(
    (index: number, patch: Partial<ResolvedAgenticItemWithOffers>) => {
      setResolved((prev) => {
        const next = prev.map((item, i) => (i === index ? { ...item, ...patch } : item));
        if (request) {
          const total = next.reduce((sum, it) => {
            if (!it.product?.priceCents) return sum;
            return sum + it.product.priceCents * it.qty;
          }, 0);
          setTotalCents(total);
          setOverBudget(request.budgetCents != null && total > request.budgetCents);
        }
        return next;
      });
    },
    [request],
  );

  const swapProduct = useCallback(
    (index: number, productId: string) => {
      const product = products.find((p) => p.id === productId);
      if (!product) return;
      updateItem(index, {
        product,
        builtinKind: null,
        warnings: [],
        searchOffers: product.affiliateUrl?.trim() ? [] : searchOffersForQuery(resolved[index]?.query ?? ''),
      });
    },
    [products, updateItem, resolved],
  );

  const sizeLabel = useMemo(() => {
    if (result?.widthIn && result?.depthIn) {
      return `${formatLength(result.widthIn, 'ft-in')} × ${formatLength(result.depthIn, 'ft-in')}`;
    }
    if (request) {
      return `${formatLength(request.widthIn, 'ft-in')} × ${formatLength(request.depthIn, 'ft-in')}`;
    }
    return null;
  }, [result, request]);

  const liveEstimateTotal = useMemo(() => {
    let total = 0;
    let any = false;
    for (const item of items) {
      if (item.estimatedCents != null) {
        total += item.estimatedCents;
        any = true;
      }
    }
    return any ? total : null;
  }, [items]);

  const statusMessage =
    generatePhase === 'sending'
      ? 'Sending to Cursor…'
      : generatePhase === 'waiting'
        ? 'Building your shopping list… (usually 30–90 seconds)'
        : null;

  const handleConfirm = async () => {
    if (!request || resolved.length === 0 || disabled || submitting) return;
    setSubmitting(true);
    try {
      const plan = rectanglePlan(request.widthIn, request.depthIn, request.heightIn);
      const environment: RoomEnvironment = {
        ...DEFAULT_ENVIRONMENT,
        appearance: appearanceForAgenticVibe(request.vibe),
      };
      const shoppingList = shoppingEntriesFromResolved(resolved);
      await onConfirm({
        plan,
        environment,
        shoppingList,
        budgetCents: request.budgetCents ?? null,
        request,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const hasCatalogMatch = resolved.some((i) => i.product != null);
  const showProductRows = Boolean(result && !catalogLoading && resolved.length > 0);
  const activeDraft = activeDraftId
    ? savedDrafts.find((d) => d.id === activeDraftId) ?? null
    : null;

  const openDraft = useCallback((draft: SavedAgenticChecklistDraft) => {
    setActiveDraftId(draft.id);
    setActiveDraftCreatedAt(draft.createdAt);
    setSaveTitle(draft.title);
    setPrompt(draft.prompt);
    setItems(draft.items);
    setResult(
      draft.listResult ?? {
        items: draft.items,
        warnings: [],
        source: 'cursor',
      },
    );
    setSavedPicks(draft.resolved);
    setParseError(null);
    setSaveMessage(null);
  }, []);

  const handleDeleteDraft = useCallback((id: string) => {
    setSavedDrafts(deleteAgenticChecklistDraft(id));
    if (activeDraftId === id) {
      setActiveDraftId(null);
      setActiveDraftCreatedAt(null);
    }
  }, [activeDraftId]);

  const persistDraft = useCallback(
    (asNew: boolean) => {
      if (!result || items.length === 0) return;
      const title = saveTitle.trim() || defaultChecklistTitle(prompt, result);
      const draft = buildAgenticChecklistDraft({
        title,
        id: asNew ? null : activeDraftId,
        createdAt: asNew ? undefined : activeDraftCreatedAt ?? undefined,
        prompt,
        listResult: result,
        items,
        resolved,
      });
      const next = saveAgenticChecklistDraft(draft);
      setSavedDrafts(next);
      setActiveDraftId(draft.id);
      setActiveDraftCreatedAt(draft.createdAt);
      setSaveTitle(draft.title);
      setSaveMessage(asNew ? 'Saved as new checklist.' : 'Checklist updated.');
    },
    [result, items, saveTitle, prompt, resolved, activeDraftId, activeDraftCreatedAt],
  );

  return (
    <div className="agentic-room-flow">
      <div className="agentic-room-flow__head">
        <Button size="sm" variant="outline" disabled={disabled || submitting || generating} onClick={onBack}>
          ← Back
        </Button>
        <p className="room-preset-goal-hint">
          Describe your room, generate a shopping list, then match products from the catalog or
          search Amazon and Google.
        </p>
      </div>

      <div className="agentic-room-flow__saved">
        <p className="agentic-room-flow__saved-title">Your saved checklists</p>
        {savedDrafts.length === 0 ? (
          <p className="agentic-room-flow__saved-empty">No saved checklists yet.</p>
        ) : (
          <ul className="agentic-room-flow__saved-list">
            {savedDrafts.map((draft) => (
              <li key={draft.id} className="agentic-room-flow__saved-card">
                <div className="agentic-room-flow__saved-card-copy">
                  <span className="agentic-room-flow__saved-card-title">{draft.title}</span>
                  <span className="agentic-room-flow__saved-card-meta">
                    {draft.items.length} items · {formatSavedChecklistDate(draft.updatedAt)}
                  </span>
                </div>
                <div className="agentic-room-flow__saved-card-actions">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled || submitting || generating}
                    onClick={() => openDraft(draft)}
                  >
                    Open
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled || submitting || generating}
                    onClick={() => handleDeleteDraft(draft.id)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="agentic-room-flow__prompt-guide">
        <p className="agentic-room-flow__prompt-guide-title">Include in your description:</p>
        <ul className="agentic-room-flow__prompt-hints">
          {PROMPT_HINTS.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      </div>

      <Field label="Room description">
        <textarea
          className="kit-input agentic-room-flow__textarea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={EXAMPLE_PROMPT}
          rows={4}
          disabled={disabled || generating || submitting}
        />
      </Field>

      {catalogLoading ? (
        <p className="agentic-room-flow__status">
          <Spinner /> Loading catalog…
        </p>
      ) : null}
      {catalogError ? <Banner tone="error">{catalogError}</Banner> : null}
      {parseError ? <Banner tone="error">{parseError}</Banner> : null}

      <div className="agentic-room-flow__actions">
        <Button
          size="md"
          disabled={disabled || generating || submitting || !prompt.trim()}
          onClick={() => void runGenerate()}
        >
          {generating ? 'Generating…' : 'Generate shopping list'}
        </Button>
      </div>

      {statusMessage ? (
        <p className="agentic-room-flow__status">
          <Spinner /> {statusMessage}
        </p>
      ) : null}

      {result ? (
        <div className="agentic-room-flow__review">
          {result.source === 'cursor' ? (
            <p className="agentic-room-flow__source-badge">Shopping list by Cursor</p>
          ) : null}

          {result.warnings.length > 0 ? (
            <div className="agentic-room-flow__warnings">
              {result.warnings.map((w) => (
                <Banner key={w} tone="info">
                  {w}
                </Banner>
              ))}
            </div>
          ) : null}

          <div className="agentic-room-flow__summary">
            {sizeLabel ? (
              <Field label="Room size">
                <Input value={sizeLabel} readOnly disabled aria-readonly />
              </Field>
            ) : null}
            {result.roomType ? (
              <Field label="Room type">
                <Input value={result.roomType} readOnly disabled aria-readonly />
              </Field>
            ) : null}
            {result.theme ? (
              <Field label="Theme">
                <Input value={result.theme} readOnly disabled aria-readonly />
              </Field>
            ) : null}
            {result.vibe ? (
              <Field label="Vibe">
                <Input
                  value={VIBE_OPTIONS.find((v) => v.id === result.vibe)?.label ?? result.vibe}
                  readOnly
                  disabled
                  aria-readonly
                />
              </Field>
            ) : null}
            {result.budgetCents != null ? (
              <p className="agentic-room-flow__budget">
                Budget: {formatAgenticPrice(result.budgetCents)}
              </p>
            ) : null}
            {liveEstimateTotal != null && !showProductRows ? (
              <p
                className={`agentic-room-flow__budget${
                  result.budgetCents != null && liveEstimateTotal > result.budgetCents
                    ? ' agentic-room-flow__over-budget'
                    : ''
                }`}
              >
                Cursor estimate: {formatAgenticPrice(liveEstimateTotal)}
              </p>
            ) : null}
            {showProductRows && request?.budgetCents != null ? (
              <p className="agentic-room-flow__budget">
                Budget: {formatAgenticPrice(request.budgetCents)}
                {overBudget ? (
                  <span className="agentic-room-flow__over-budget">
                    {' '}
                    — catalog total {formatAgenticPrice(totalCents)} (over budget)
                  </span>
                ) : (
                  <span> — catalog total {formatAgenticPrice(totalCents)}</span>
                )}
              </p>
            ) : null}
            {showProductRows && request && request.budgetCents == null ? (
              <p className="agentic-room-flow__budget">
                Catalog total: {formatAgenticPrice(totalCents)}
              </p>
            ) : null}
          </div>

          {catalogLoading ? (
            <Banner tone="info">Loading catalog — search links appear below while we match products.</Banner>
          ) : null}

          {overBudget && showProductRows ? (
            <Banner tone="info">
              Selected products exceed your budget. Swap items or remove some before creating the
              room.
            </Banner>
          ) : null}

          {showProductRows && !hasCatalogMatch ? (
            <Banner tone="info">
              No catalog matches — use Search Amazon / Search Google Shopping on each item below.
            </Banner>
          ) : null}

          <div className="agentic-room-flow__items">
            {showProductRows
              ? resolved.map((item, index) => (
                  <ProductRow
                    key={`${item.query}-${index}`}
                    item={item}
                    disabled={disabled || submitting}
                    onSwap={(productId) => swapProduct(index, productId)}
                    onQty={(qty) => {
                      updateItem(index, { qty });
                      setItems((prev) =>
                        prev.map((row, i) => (i === index ? { ...row, qty } : row)),
                      );
                    }}
                    onRemove={() => {
                      setResolved((prev) => prev.filter((_, i) => i !== index));
                      setItems((prev) => prev.filter((_, i) => i !== index));
                    }}
                  />
                ))
              : items.map((item, index) => (
                  <FurnitureListRow
                    key={`${item.query}-${index}`}
                    item={item}
                    index={index}
                    disabled={disabled || generating || submitting}
                    onQuery={(query) =>
                      setItems((prev) =>
                        prev.map((row, i) => (i === index ? { ...row, query } : row)),
                      )
                    }
                    onQty={(qty) =>
                      setItems((prev) =>
                        prev.map((row, i) => (i === index ? { ...row, qty } : row)),
                      )
                    }
                    onRemove={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                  />
                ))}
          </div>

          {!showProductRows ? (
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || generating || submitting}
              onClick={() => setItems((prev) => [...prev, { query: '', qty: 1 }])}
            >
              Add item
            </Button>
          ) : null}

          <div className="agentic-room-flow__save-panel">
            <Field
              label={
                activeDraft
                  ? `Update “${activeDraft.title}”`
                  : 'Save checklist'
              }
            >
              <Input
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                placeholder={defaultChecklistTitle(prompt, result)}
                disabled={disabled || generating || submitting}
                aria-label="Checklist title"
              />
            </Field>
            <div className="agentic-room-flow__save-actions">
              <Button
                size="sm"
                disabled={disabled || generating || submitting || items.length === 0}
                onClick={() => persistDraft(false)}
              >
                {activeDraft ? 'Update' : 'Save'}
              </Button>
              {activeDraft ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={disabled || generating || submitting || items.length === 0}
                  onClick={() => persistDraft(true)}
                >
                  Save as new
                </Button>
              ) : null}
            </div>
            {saveMessage ? (
              <p className="agentic-room-flow__save-message">{saveMessage}</p>
            ) : null}
          </div>

          {showProductRows && resolved.length > 0 ? (
            <Button
              size="md"
              full
              disabled={disabled || submitting || !hasCatalogMatch}
              onClick={() => void handleConfirm()}
            >
              {submitting ? 'Creating…' : 'Create room & add to checklist'}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}