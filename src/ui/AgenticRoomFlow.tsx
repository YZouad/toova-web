import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FloorPlan } from '../lib/floorPlanGeometry';
import { rectanglePlan } from '../lib/floorPlanGeometry';
import type { AgenticItemAsk, AgenticRoomRequest, AgenticVibeId } from '../lib/agenticRoomPrompt';
import type { AgenticFurnitureListResult } from '../lib/agenticRoomListTypes';
import {
  curtainColorFromScheme,
  furnishingsFromColorScheme,
  inferColorSchemeFromTheme,
  mergeAppearanceWithColorScheme,
} from '../lib/agenticColorScheme';
import { AgenticColorSchemeEditor } from './AgenticColorSchemeEditor';
import {
  appearanceForAgenticTheme,
  appearanceForAgenticVibe,
  applyAgenticPaletteToItems,
  applyAgenticThemeToItems,
  applyAgenticVibeToItems,
  furnishingsForAgenticVibe,
} from '../lib/agenticRoomVibe';
import { resolveAgenticThemeProfile, rotatedThemeSuggestions } from '../lib/agenticThemeProfile';
import {
  manifestFromResolved,
  type AgenticShoppingManifestEntry,
} from '../lib/agenticShoppingManifest';
import { fetchFurnitureListFromCursor } from '../lib/agenticRoomCursorApi';
import {
  flattenCatalogProducts,
  formatAgenticPrice,
} from '../lib/agenticRoomResolve';
import {
  resolveAgenticList,
  type AgenticReviewRow,
} from '../lib/agenticRoomResolveFromList';
import { shoppingEntriesFromResolved } from '../lib/agenticRoomApplyChecklist';
import {
  applyWindowCurtainsToPlan,
  resolveAgentWindowCurtains,
} from '../lib/agenticRoomWindowDressing';
import {
  buildAgenticPackPieces,
  defaultPlaceInRoom,
  packAgenticRoomItems,
  rowCanPlaceInRoom,
} from '../lib/agenticRoomPack';
import { resolveStarterItemAssets } from '../lib/starterTemplateOverrides';
import { fetchPublishedShoppingCatalog } from '../lib/shoppingCatalog';
import { searchOffersForQuery, type AffiliateOffer } from '../lib/affiliateLinks';
import type { CuratedProduct, ShoppingListEntry } from '../lib/dormChecklist';
import {
  communityGallerySearchPath,
  fetchCommunityMatchesByQuery,
  type AgenticCommunityMatch,
} from '../lib/agenticCommunityMatch';
import { trackAffiliateClicked } from '../lib/analytics';
import { galleryPath, navigate } from '../hooks/useRoute';
import {
  createManualChecklistResult,
  mergeAiSuggestionsIntoList,
} from '../lib/agenticManualChecklist';
import { buildGallerySearchParams } from '../lib/galleryCatalogHelpers';
import {
  clearAgenticChecklistSession,
  drainAgenticChecklistPicks,
  loadAgenticChecklistSession,
  mergePendingPicksIntoSession,
  resolvedRowsToSavedPicks,
  saveAgenticChecklistSession,
  setAgenticChecklistPickMode,
  type AgenticChecklistSession,
} from '../lib/agenticChecklistSession';
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
import { DEFAULT_ENVIRONMENT, type Item, type RoomEnvironment } from '../store';
import { Banner, Button, Field, Input, Spinner } from './kit';

export interface AgenticRoomConfirmPayload {
  plan: FloorPlan;
  environment: RoomEnvironment;
  shoppingList: ShoppingListEntry[];
  agenticShoppingManifest: AgenticShoppingManifestEntry[];
  budgetCents?: number | null;
  request: AgenticRoomRequest;
  seedItems: Item[];
  seedOrder: string[];
  packSkipped: string[];
}

interface AgenticRoomFlowProps {
  disabled?: boolean;
  onConfirm: (payload: AgenticRoomConfirmPayload) => void | Promise<void>;
  onBack: () => void;
}

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

function CommunityMatches({
  query,
  matches,
  loading,
  selectedKind,
  onUseModel,
  disabled,
}: {
  query: string;
  matches: AgenticCommunityMatch[];
  loading?: boolean;
  selectedKind?: string | null;
  onUseModel?: (match: AgenticCommunityMatch) => void;
  disabled?: boolean;
}) {
  if (loading) {
    return (
      <p className="agentic-room-item__community-status">
        <Spinner /> Checking community gallery…
      </p>
    );
  }
  if (matches.length === 0) return null;

  const browseHref = galleryPath(communityGallerySearchPath(query));

  return (
    <div className="agentic-room-item__community">
      <p className="agentic-room-item__community-title">Similar in Community Gallery</p>
      <ul className="agentic-room-item__community-list">
        {matches.slice(0, 3).map((match, matchIndex) => (
          <li key={`${match.kind}-${matchIndex}`} className="agentic-room-item__community-row">
            <button
              type="button"
              className="agentic-room-item__community-card"
              onClick={() => {
                if (onUseModel && match.modelUrl) onUseModel(match);
                else navigate(browseHref);
              }}
            >
              {match.previewUrl ? (
                <img src={match.previewUrl} alt="" className="agentic-room-item__community-img" />
              ) : (
                <div className="agentic-room-item__community-img agentic-room-item__community-img--empty" aria-hidden />
              )}
              <span className="agentic-room-item__community-copy">
                <span className="agentic-room-item__community-label">{match.label}</span>
                {match.creatorHandle ? (
                  <span className="agentic-room-item__community-creator">@{match.creatorHandle}</span>
                ) : null}
              </span>
            </button>
            {onUseModel && match.modelUrl ? (
              <Button
                size="sm"
                variant={selectedKind === match.kind ? 'primary' : 'outline'}
                disabled={disabled}
                onClick={() => onUseModel(match)}
              >
                {selectedKind === match.kind ? 'Using this model' : 'Use this model'}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <a className="agentic-room-item__community-browse" href={browseHref} onClick={(e) => { e.preventDefault(); navigate(browseHref); }}>
        Browse all community results
      </a>
    </div>
  );
}

function SearchLinks({
  query,
  communityMatches,
  communityLoading,
  selectedCommunityKind,
  onUseCommunityModel,
  disabled,
  catalogMatchStatus = 'unmatched',
}: {
  query: string;
  communityMatches?: AgenticCommunityMatch[];
  communityLoading?: boolean;
  selectedCommunityKind?: string | null;
  onUseCommunityModel?: (match: AgenticCommunityMatch) => void;
  disabled?: boolean;
  catalogMatchStatus?: 'pending' | 'unmatched';
}) {
  const offers = searchOffersForQuery(query);
  const hasCommunity = communityLoading || (communityMatches?.length ?? 0) > 0;
  if (offers.length === 0 && !hasCommunity) return null;
  const approxCopy =
    catalogMatchStatus === 'pending'
      ? 'Matching to our catalog — search links below if we don’t find a product.'
      : 'No catalog match — search results may not match exactly.';
  return (
    <div className="agentic-room-item__search-fallback">
      {offers.length > 0 ? (
        <>
          <p className="agentic-room-item__search-approx">{approxCopy}</p>
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
        </>
      ) : null}
      <CommunityMatches
        query={query}
        matches={communityMatches ?? []}
        loading={communityLoading}
        selectedKind={selectedCommunityKind}
        onUseModel={onUseCommunityModel}
        disabled={disabled}
      />
    </div>
  );
}

function ItemResolutionBar({
  resolution,
  disabled,
  onHave,
  onSkip,
  onUndo,
}: {
  resolution?: 'have' | 'skip' | null;
  disabled?: boolean;
  onHave: () => void;
  onSkip: () => void;
  onUndo: () => void;
}) {
  if (resolution === 'skip') {
    return (
      <div className="agentic-room-item__resolution">
        <span className="agentic-room-item__resolution-label">Marked as not needed</span>
        <button type="button" className="agentic-room-item__resolution-undo" disabled={disabled} onClick={onUndo}>
          Undo
        </button>
      </div>
    );
  }
  if (resolution === 'have') {
    return (
      <div className="agentic-room-item__resolution">
        <span className="agentic-room-item__resolution-label">Already purchased</span>
        <button type="button" className="agentic-room-item__resolution-undo" disabled={disabled} onClick={onUndo}>
          Undo
        </button>
      </div>
    );
  }
  return (
    <div className="agentic-room-item__resolution">
      <button type="button" className="agentic-room-item__resolution-btn" disabled={disabled} onClick={onHave}>
        Already have
      </button>
      <button type="button" className="agentic-room-item__resolution-btn" disabled={disabled} onClick={onSkip}>
        Don&apos;t need
      </button>
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
  communityMatches,
  communityLoading,
  catalogMatchPending,
  placeInRoom,
  onPlaceInRoom,
  canPlace,
  selectedCommunityKind,
  onUseCommunityModel,
  resolution,
  onSetResolution,
}: {
  item: AgenticItemAsk;
  index: number;
  disabled?: boolean;
  onQuery: (query: string) => void;
  onQty: (qty: number) => void;
  onRemove: () => void;
  communityMatches?: AgenticCommunityMatch[];
  communityLoading?: boolean;
  catalogMatchPending?: boolean;
  placeInRoom?: boolean;
  onPlaceInRoom?: (checked: boolean) => void;
  canPlace?: boolean;
  selectedCommunityKind?: string | null;
  onUseCommunityModel?: (match: AgenticCommunityMatch) => void;
  resolution?: 'have' | 'skip' | null;
  onSetResolution?: (resolution: 'have' | 'skip' | null) => void;
}) {
  const resolved = resolution === 'have' || resolution === 'skip';

  return (
    <div className={`agentic-room-item agentic-room-item--list${resolved ? ' is-resolved' : ''}`}>
      <Field label={`Item ${index + 1}`}>
        <Input
          value={item.query}
          disabled={disabled || resolved}
          onChange={(e) => onQuery(e.target.value)}
          aria-label={`Furniture item ${index + 1}`}
        />
      </Field>
      {!resolved ? (
        <SearchLinks
          query={item.query}
          communityMatches={communityMatches}
          communityLoading={communityLoading}
          selectedCommunityKind={selectedCommunityKind}
          onUseCommunityModel={onUseCommunityModel}
          disabled={disabled}
          catalogMatchStatus={catalogMatchPending ? 'pending' : 'unmatched'}
        />
      ) : null}
      {onSetResolution ? (
        <ItemResolutionBar
          resolution={resolution}
          disabled={disabled}
          onHave={() => onSetResolution('have')}
          onSkip={() => onSetResolution('skip')}
          onUndo={() => onSetResolution(null)}
        />
      ) : null}
      <div className="agentic-room-item__footer">
        <div className="agentic-room-item__footer-meta">
          {canPlace && onPlaceInRoom ? (
            <label className="agentic-room-item__place">
              <input
                type="checkbox"
                checked={placeInRoom ?? false}
                disabled={disabled || resolved}
                onChange={(e) => onPlaceInRoom(e.target.checked)}
              />
              Place in room
            </label>
          ) : null}
          {item.estimatedCents != null ? (
            <span className="agentic-room-item__estimate">
              ~{formatAgenticPrice(item.estimatedCents)}
            </span>
          ) : null}
        </div>
        <div className="agentic-room-item__footer-controls">
          <label className="agentic-room-item__qty">
            Qty
            <Input
              type="number"
              min={1}
              max={99}
              value={String(item.qty)}
              disabled={disabled || resolved}
              onChange={(e) => onQty(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <Button size="sm" variant="outline" disabled={disabled} onClick={onRemove}>
            Remove
          </Button>
        </div>
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
  onPlaceInRoom,
  onUseCommunityModel,
  communityMatches,
  communityLoading,
  resolution,
  onSetResolution,
}: {
  item: AgenticReviewRow;
  disabled?: boolean;
  onSwap: (productId: string) => void;
  onQty: (qty: number) => void;
  onRemove: () => void;
  onPlaceInRoom: (checked: boolean) => void;
  onUseCommunityModel: (match: AgenticCommunityMatch) => void;
  communityMatches?: AgenticCommunityMatch[];
  communityLoading?: boolean;
  resolution?: 'have' | 'skip' | null;
  onSetResolution?: (resolution: 'have' | 'skip' | null) => void;
}) {
  const product = item.product;
  const price = product ? formatAgenticPrice(product.priceCents) : '—';
  const showCatalogMatch =
    Boolean(product) &&
    product!.name.trim().toLowerCase() !== item.query.trim().toLowerCase();
  const resolved = resolution === 'have' || resolution === 'skip';

  return (
    <div className={`agentic-room-item${resolved ? ' is-resolved' : ''}`}>
      <div className="agentic-room-item__main">
        {product?.imageUrl ? (
          <img src={product.imageUrl} alt="" className="agentic-room-item__img" />
        ) : (
          <div className="agentic-room-item__img agentic-room-item__img--empty" aria-hidden />
        )}
        <div className="agentic-room-item__copy">
          <div className="agentic-room-item__name">{item.query}</div>
          {showCatalogMatch ? (
            <div className="agentic-room-item__query">Catalog match: {product!.name}</div>
          ) : null}
          {item.bankPoster ? (
            <div className="agentic-room-item__query">
              Toova poster: {item.bankPoster.label}
            </div>
          ) : null}
          {!resolved && product?.affiliateUrl ? (
            <div className="agentic-room-item__meta">
              <span>{price}</span>
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
            </div>
          ) : null}
          {!resolved && !product?.affiliateUrl ? (
            <SearchLinks
              query={item.query}
              communityMatches={communityMatches}
              communityLoading={communityLoading}
              selectedCommunityKind={item.communityModel?.kind ?? null}
              onUseCommunityModel={onUseCommunityModel}
              disabled={disabled}
              catalogMatchStatus="unmatched"
            />
          ) : null}
          {item.warnings.map((w) => (
            <p key={w} className="agentic-room-item__warn">
              {w}
            </p>
          ))}
        </div>
      </div>
      {onSetResolution ? (
        <ItemResolutionBar
          resolution={resolution}
          disabled={disabled}
          onHave={() => onSetResolution('have')}
          onSkip={() => onSetResolution('skip')}
          onUndo={() => onSetResolution(null)}
        />
      ) : null}
      <div className="agentic-room-item__footer">
        <div className="agentic-room-item__footer-meta">
          {rowCanPlaceInRoom(item) || item.communityModel || item.bankPoster ? (
            <label className="agentic-room-item__place">
              <input
                type="checkbox"
                checked={item.placeInRoom}
                disabled={disabled || resolved}
                onChange={(e) => onPlaceInRoom(e.target.checked)}
              />
              Place in room
            </label>
          ) : null}
          {product && !resolved ? <span className="agentic-room-item__estimate">{price}</span> : null}
        </div>
        <div className="agentic-room-item__footer-controls">
          {item.alternates.length > 0 ? (
            <select
              className="agentic-room-item__swap"
              disabled={disabled || resolved}
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
              disabled={disabled || resolved}
              onChange={(e) => onQty(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <Button size="sm" variant="outline" disabled={disabled} onClick={onRemove}>
            Remove
          </Button>
        </div>
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
  const [resolved, setResolved] = useState<AgenticReviewRow[]>([]);
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
  const [communityByQuery, setCommunityByQuery] = useState<Record<string, AgenticCommunityMatch[]>>({});
  const [communityLoadingQueries, setCommunityLoadingQueries] = useState<Set<string>>(() => new Set());
  const [showMoreSuggestions, setShowMoreSuggestions] = useState(false);
  const [itemResolutions, setItemResolutions] = useState<Map<number, 'have' | 'skip'>>(new Map());
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [enhancePrompt, setEnhancePrompt] = useState('');
  const [enhancing, setEnhancing] = useState(false);

  const themeSuggestions = useMemo(() => rotatedThemeSuggestions(8), []);
  const visibleSuggestions = showMoreSuggestions
    ? themeSuggestions
    : themeSuggestions.slice(0, 4);

  const itemsKey = useMemo(
    () => items.map((i) => `${i.query.trim().toLowerCase()}:${i.qty}`).join('|'),
    [items],
  );

  const shoppableItems = useMemo(
    () => items.filter((item) => item.query.trim().length > 0),
    [itemsKey, items],
  );

  const applyChecklistSession = useCallback((session: AgenticChecklistSession) => {
    setPrompt(session.prompt);
    setResult(session.result);
    setItems(session.items);
    setSavedPicks(session.savedPicks);
    setActiveDraftId(session.activeDraftId ?? null);
    setSaveTitle(session.saveTitle ?? defaultChecklistTitle(session.prompt, session.result));
    setItemResolutions(new Map(session.itemResolutions ?? []));
    setParseError(null);
    setShowAiPrompt(session.result?.source === 'cursor');
  }, []);

  const buildSessionSnapshot = useCallback((): AgenticChecklistSession => {
    return {
      prompt,
      result,
      items,
      savedPicks:
        savedPicks ??
        (resolved.length > 0 ? resolvedRowsToSavedPicks(resolved) : undefined),
      activeDraftId,
      saveTitle: saveTitle || defaultChecklistTitle(prompt, result),
      itemResolutions: [...itemResolutions.entries()],
    };
  }, [
    prompt,
    result,
    items,
    savedPicks,
    resolved,
    activeDraftId,
    saveTitle,
    itemResolutions,
  ]);

  const openGalleryForPick = useCallback(() => {
    saveAgenticChecklistSession(buildSessionSnapshot());
    setAgenticChecklistPickMode({ returnPath: '/' });
    navigate(
      galleryPath(
        buildGallerySearchParams({
          mode: 'models',
          source: 'community',
          pick: 'checklist',
        }),
      ),
    );
  }, [buildSessionSnapshot]);

  useEffect(() => {
    const session = loadAgenticChecklistSession();
    const picks = drainAgenticChecklistPicks();
    if (!session && picks.length === 0) return;
    const merged = session
      ? mergePendingPicksIntoSession(session, picks)
      : null;
    if (!merged) return;
    applyChecklistSession(merged);
    saveAgenticChecklistSession(merged);
    if (picks.length > 0) {
      setSaveMessage(
        `Added ${picks.length} community item${picks.length === 1 ? '' : 's'} to your checklist.`,
      );
    }
  }, [applyChecklistSession]);

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

  const startManualChecklist = useCallback(() => {
    const manual = createManualChecklistResult();
    setParseError(null);
    setResult(manual);
    setItems(manual.items);
    setSavedPicks(undefined);
    setActiveDraftId(null);
    setActiveDraftCreatedAt(null);
    setSaveMessage(null);
    setSaveTitle('My checklist');
    setItemResolutions(new Map());
    setPrompt('');
    setShowAiPrompt(false);
  }, []);

  const resetChecklistFlow = useCallback(
    (options?: { deleteActiveDraft?: boolean }) => {
      if (options?.deleteActiveDraft && activeDraftId) {
        setSavedDrafts(deleteAgenticChecklistDraft(activeDraftId));
      }
      clearAgenticChecklistSession();
      setResult(null);
      setItems([]);
      setPrompt('');
      setResolved([]);
      setRequest(null);
      setGeneratePhase('idle');
      setGenerating(false);
      setOverBudget(false);
      setTotalCents(0);
      setSavedPicks(undefined);
      setActiveDraftId(null);
      setActiveDraftCreatedAt(null);
      setSaveTitle('');
      setSaveMessage(null);
      setItemResolutions(new Map());
      setParseError(null);
      setShowAiPrompt(false);
      setEnhancePrompt('');
      setCommunityByQuery({});
      setCommunityLoadingQueries(new Set());
    },
    [activeDraftId],
  );

  const patchListResult = useCallback((patch: Partial<AgenticFurnitureListResult>) => {
    setResult((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const runEnhanceWithAi = useCallback(async () => {
    const hint = enhancePrompt.trim() || prompt.trim();
    if (!hint || !result) return;
    setEnhancing(true);
    setParseError(null);
    try {
      const suggested = await fetchFurnitureListFromCursor(hint);
      if (suggested.items.length === 0) {
        setParseError(suggested.warnings[0] ?? 'No new items suggested.');
        return;
      }
      const merged = mergeAiSuggestionsIntoList(result, suggested);
      setResult(merged);
      setItems(merged.items);
      setSaveMessage(
        `Added ${merged.items.length - result.items.length} item${merged.items.length - result.items.length === 1 ? '' : 's'} from AI.`,
      );
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Could not enhance checklist');
    } finally {
      setEnhancing(false);
    }
  }, [enhancePrompt, prompt, result]);

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
      setItemResolutions(new Map());
      setShowAiPrompt(true);
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
    if (!result || catalogLoading || shoppableItems.length === 0) return;
    const listInput: AgenticFurnitureListResult = { ...result, items: shoppableItems };
    const matchResult = resolveAgenticList(listInput, products, prompt);
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
  }, [result, catalogLoading, products, shoppableItems, itemsKey, savedPicks, prompt]);

  const communityQueryKey = useMemo(() => {
    if (!result || items.length === 0) return '';
    const queries =
      !catalogLoading && resolved.length > 0
        ? resolved
            .filter((row) => !row.product?.affiliateUrl?.trim())
            .map((row) => row.query.trim())
        : items.map((row) => row.query.trim());
    return [...new Set(queries.filter((q) => q.length >= 2))].sort().join('|');
  }, [result, items, resolved, catalogLoading, itemsKey]);

  useEffect(() => {
    if (!communityQueryKey) {
      setCommunityByQuery({});
      setCommunityLoadingQueries(new Set());
      return;
    }
    const queries = communityQueryKey.split('|');
    let cancelled = false;
    setCommunityLoadingQueries(new Set(queries));
    void fetchCommunityMatchesByQuery(queries).then((next) => {
      if (cancelled) return;
      setCommunityByQuery(next);
      setCommunityLoadingQueries(new Set());
    });
    return () => {
      cancelled = true;
    };
  }, [communityQueryKey]);

  const setItemResolution = useCallback((index: number, resolution: 'have' | 'skip' | null) => {
    setItemResolutions((prev) => {
      const next = new Map(prev);
      if (resolution == null) next.delete(index);
      else next.set(index, resolution);
      return next;
    });
  }, []);

  const reindexItemResolutionsAfterRemove = useCallback((removedIndex: number) => {
    setItemResolutions((prev) => {
      const next = new Map<number, 'have' | 'skip'>();
      prev.forEach((value, key) => {
        if (key < removedIndex) next.set(key, value);
        else if (key > removedIndex) next.set(key - 1, value);
      });
      return next;
    });
  }, []);

  const removeSavedPickForQuery = useCallback((query: string) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return;
    setSavedPicks((prev) =>
      prev?.filter((pick) => pick.query.trim().toLowerCase() !== normalized),
    );
  }, []);

  const removeResolvedItemAt = useCallback(
    (index: number) => {
      let queryToRemove = '';
      setResolved((prev) => {
        const removed = prev[index];
        if (!removed) return prev;
        queryToRemove = removed.query.trim().toLowerCase();
        return prev.filter((_, i) => i !== index);
      });
      if (!queryToRemove) return;
      setItems((prev) => {
        let found = false;
        return prev.filter((row) => {
          if (!found && row.query.trim().toLowerCase() === queryToRemove) {
            found = true;
            return false;
          }
          return true;
        });
      });
      removeSavedPickForQuery(queryToRemove);
      reindexItemResolutionsAfterRemove(index);
    },
    [removeSavedPickForQuery, reindexItemResolutionsAfterRemove],
  );

  const removeListItemAt = useCallback(
    (index: number) => {
      let queryToRemove = '';
      setItems((prev) => {
        const removed = prev[index];
        if (!removed) return prev;
        queryToRemove = removed.query.trim().toLowerCase();
        return prev.filter((_, i) => i !== index);
      });
      if (queryToRemove) removeSavedPickForQuery(queryToRemove);
      reindexItemResolutionsAfterRemove(index);
    },
    [removeSavedPickForQuery, reindexItemResolutionsAfterRemove],
  );

  const updateItem = useCallback(
    (index: number, patch: Partial<AgenticReviewRow>) => {
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
      const row = resolved[index];
      updateItem(index, {
        product,
        builtinKind: null,
        warnings: [],
        searchOffers: product.affiliateUrl?.trim() ? [] : searchOffersForQuery(row?.query ?? ''),
        placeInRoom: row
          ? defaultPlaceInRoom({
              query: row.query,
              product,
              builtinKind: null,
              communityModel: row.communityModel,
              bankPoster: row.bankPoster,
            })
          : true,
      });
    },
    [products, updateItem, resolved],
  );

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
      let plan = rectanglePlan(request.widthIn, request.depthIn, request.heightIn);
      let windowCurtains = result ? resolveAgentWindowCurtains(result) : undefined;
      const schemeColors = result?.colorScheme;
      if (windowCurtains?.enabled && schemeColors?.length) {
        const curtainColor = curtainColorFromScheme(schemeColors);
        if (curtainColor) {
          windowCurtains = { ...windowCurtains, color: curtainColor };
        }
      }
      plan = applyWindowCurtainsToPlan(plan, windowCurtains);
      const theme = result?.theme ?? null;
      const vibeAppearance = appearanceForAgenticVibe(request.vibe);
      const themeAppearance = appearanceForAgenticTheme(theme, prompt);
      const environment: RoomEnvironment = {
        ...DEFAULT_ENVIRONMENT,
        appearance: mergeAppearanceWithColorScheme(
          {
            ...vibeAppearance,
            ...(themeAppearance ?? {}),
          },
          schemeColors,
        ),
      };
      const activeResolved = resolved.filter((_, index) => itemResolutions.get(index) !== 'skip');
      const shoppingList = shoppingEntriesFromResolved(
        resolved.filter((_, index) => {
          const resolution = itemResolutions.get(index);
          return resolution !== 'skip' && resolution !== 'have';
        }),
      );
      const agenticShoppingManifest = manifestFromResolved(activeResolved).map((entry) => {
        const rowIndex = resolved.findIndex((row) => row.query === entry.query);
        if (rowIndex >= 0 && itemResolutions.get(rowIndex) === 'have') {
          return { ...entry, resolution: 'have' as const };
        }
        return entry;
      });
      const packRows = resolved.filter((row, index) => {
        const resolution = itemResolutions.get(index);
        return row.placeInRoom && resolution !== 'skip' && resolution !== 'have';
      });
      const pieces = await buildAgenticPackPieces(packRows, plan);
      const packed = packAgenticRoomItems(plan, pieces, packRows);
      let vibeItems = applyAgenticThemeToItems(
        applyAgenticVibeToItems(packed.items, request.vibe),
        theme,
        prompt,
      );
      const vibePalette = furnishingsForAgenticVibe(result?.vibe ?? request.vibe);
      const profile = resolveAgenticThemeProfile(theme, prompt);
      let palette = profile?.furnishings ?? vibePalette;
      if (schemeColors?.length) {
        palette = furnishingsFromColorScheme(schemeColors, palette);
        vibeItems = applyAgenticPaletteToItems(vibeItems, palette);
      }
      await resolveStarterItemAssets(vibeItems);
      await onConfirm({
        plan,
        environment,
        shoppingList,
        agenticShoppingManifest,
        budgetCents: request.budgetCents ?? null,
        request,
        seedItems: vibeItems,
        seedOrder: packed.order,
        packSkipped: packed.skipped,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const useCommunityModel = useCallback((index: number, match: AgenticCommunityMatch) => {
    setResolved((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              communityModel: row.communityModel?.kind === match.kind ? null : match,
              placeInRoom: row.communityModel?.kind === match.kind ? row.placeInRoom : true,
            }
          : row,
      ),
    );
  }, []);

  const hasCatalogMatch = resolved.some((i) => i.product != null);
  const hasPlaceableSelection = resolved.some(
    (row) => row.placeInRoom && (rowCanPlaceInRoom(row) || row.communityModel || row.bankPoster),
  );
  const canCreateRoom = resolved.length > 0 && (hasCatalogMatch || hasPlaceableSelection);
  const showProductRows = Boolean(result && resolved.length > 0);
  const isManualList = result?.source === 'manual';
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
          Build a shopping checklist from scratch, pick community models, or let AI suggest items —
          then create a furnished room.
        </p>
      </div>

      {savedDrafts.length > 0 ? (
        <div className="agentic-room-flow__saved">
          <p className="agentic-room-flow__saved-title">Continue a saved checklist</p>
          <ul className="agentic-room-flow__saved-list">
            {savedDrafts.map((draft) => (
              <li key={draft.id} className="agentic-room-flow__saved-card">
                <button
                  type="button"
                  className="agentic-room-flow__saved-card-main"
                  disabled={disabled || submitting || generating}
                  onClick={() => openDraft(draft)}
                >
                  <span className="agentic-room-flow__saved-card-title">{draft.title}</span>
                  <span className="agentic-room-flow__saved-card-meta">
                    {draft.items.length} items · {formatSavedChecklistDate(draft.updatedAt)}
                  </span>
                </button>
                <div className="agentic-room-flow__saved-card-actions">
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
        </div>
      ) : null}

      {!result ? (
        <div className="agentic-room-flow__start">
          <p className="agentic-room-flow__start-title">How do you want to start?</p>
          <div className="agentic-room-flow__start-options">
            <button
              type="button"
              className="agentic-room-flow__start-card"
              disabled={disabled || generating || submitting}
              onClick={() => {
                setShowAiPrompt(true);
                setParseError(null);
              }}
            >
              <span className="agentic-room-flow__start-card-title">Suggest with AI</span>
              <span className="agentic-room-flow__start-card-copy">
                Describe your room and we&apos;ll draft a shopping list to edit.
              </span>
            </button>
            <button
              type="button"
              className="agentic-room-flow__start-card"
              disabled={disabled || generating || submitting}
              onClick={startManualChecklist}
            >
              <span className="agentic-room-flow__start-card-title">Build my own checklist</span>
              <span className="agentic-room-flow__start-card-copy">
                Start with common dorm essentials, add items, and pick community models.
              </span>
            </button>
          </div>
        </div>
      ) : null}

      {!result && showAiPrompt ? (
        <>
          <Field label="Tell us about your room">
            <textarea
              className="kit-input agentic-room-flow__textarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. minecraft dorm with a desk and somewhere to sleep, around $600"
              rows={4}
              disabled={disabled || generating || submitting}
            />
          </Field>

          <div className="agentic-room-flow__examples">
            <span className="agentic-room-flow__examples-label">Try an idea:</span>
            <div className="agentic-room-flow__examples-list">
              {visibleSuggestions.map((suggestion) => (
                <button
                  key={suggestion.prompt}
                  type="button"
                  className="agentic-room-flow__example-chip"
                  disabled={disabled || generating || submitting}
                  onClick={() => setPrompt(suggestion.prompt)}
                >
                  {suggestion.prompt}
                </button>
              ))}
              {themeSuggestions.length > 4 ? (
                <button
                  type="button"
                  className="agentic-room-flow__example-chip agentic-room-flow__example-chip--more"
                  disabled={disabled || generating || submitting}
                  onClick={() => setShowMoreSuggestions((v) => !v)}
                >
                  {showMoreSuggestions ? 'Fewer ideas' : 'More ideas'}
                </button>
              ) : null}
            </div>
          </div>

          <div className="agentic-room-flow__actions">
            <Button
              size="md"
              disabled={disabled || generating || submitting || !prompt.trim()}
              onClick={() => void runGenerate()}
            >
              {generating ? 'Generating…' : 'Generate shopping list'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || generating || submitting}
              onClick={() => setShowAiPrompt(false)}
            >
              Back
            </Button>
          </div>
        </>
      ) : null}

      {catalogLoading ? (
        <p className="agentic-room-flow__status">
          <Spinner /> Loading catalog…
        </p>
      ) : null}
      {catalogError ? <Banner tone="error">{catalogError}</Banner> : null}
      {parseError ? <Banner tone="error">{parseError}</Banner> : null}

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
          {result.source === 'manual' ? (
            <p className="agentic-room-flow__source-badge">Your checklist</p>
          ) : null}

          <div className="agentic-room-flow__checklist-toolbar">
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || generating || submitting}
              onClick={() => setItems((prev) => [...prev, { query: '', qty: 1 }])}
            >
              Add item
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || generating || submitting}
              onClick={openGalleryForPick}
            >
              Browse community gallery
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || generating || submitting}
              onClick={() => resetChecklistFlow()}
            >
              Start over
            </Button>
            {activeDraftId ? (
              <Button
                size="sm"
                variant="outline"
                disabled={disabled || generating || submitting}
                onClick={() => resetChecklistFlow({ deleteActiveDraft: true })}
              >
                Delete checklist
              </Button>
            ) : null}
          </div>
          <p className="agentic-room-flow__checklist-hint">
            Edit each line, pick a community model when we find a match, then create your room.
          </p>

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
            <Field label="Room width (feet)">
              <Input
                type="number"
                min={6}
                max={30}
                value={String(Math.round((result.widthIn ?? 120) / 12))}
                disabled={disabled || generating || submitting}
                onChange={(e) => {
                  const feet = Math.max(6, Number(e.target.value) || 10);
                  patchListResult({ widthIn: feet * 12 });
                }}
              />
            </Field>
            <Field label="Room depth (feet)">
              <Input
                type="number"
                min={6}
                max={30}
                value={String(Math.round((result.depthIn ?? 144) / 12))}
                disabled={disabled || generating || submitting}
                onChange={(e) => {
                  const feet = Math.max(6, Number(e.target.value) || 12);
                  patchListResult({ depthIn: feet * 12 });
                }}
              />
            </Field>
            <Field label="Room type">
              <Input
                value={result.roomType ?? ''}
                placeholder="dorm bedroom"
                disabled={disabled || generating || submitting}
                onChange={(e) => patchListResult({ roomType: e.target.value || undefined })}
              />
            </Field>
            <Field label="Theme">
              <Input
                value={result.theme ?? ''}
                placeholder="gothic, coastal, minecraft…"
                disabled={disabled || generating || submitting}
                onChange={(e) => {
                  const theme = e.target.value || undefined;
                  const colorScheme = theme
                    ? inferColorSchemeFromTheme(theme, prompt)
                    : undefined;
                  patchListResult({
                    theme,
                    ...(colorScheme ? { colorScheme } : {}),
                  });
                }}
              />
            </Field>
            <div className="agentic-room-flow__summary-colors">
              <p className="agentic-room-flow__summary-colors-label">Color scheme</p>
              <AgenticColorSchemeEditor
                value={result.colorScheme}
                disabled={disabled || generating || submitting}
                onChange={(colorScheme) => patchListResult({ colorScheme })}
              />
            </div>
            <Field label="Vibe">
              <select
                className="kit-input"
                value={result.vibe ?? ''}
                disabled={disabled || generating || submitting}
                onChange={(e) =>
                  patchListResult({
                    vibe: (e.target.value || undefined) as AgenticVibeId | undefined,
                  })
                }
              >
                <option value="">Auto</option>
                {VIBE_OPTIONS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </Field>
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

          <div className="agentic-room-flow__items">
            {showProductRows
              ? resolved.map((item, index) => (
                  <ProductRow
                    key={`${item.query}-${index}`}
                    item={item}
                    disabled={disabled || submitting}
                    communityMatches={communityByQuery[item.query.trim()]}
                    communityLoading={communityLoadingQueries.has(item.query.trim())}
                    resolution={itemResolutions.get(index) ?? null}
                    onSetResolution={(resolution) => setItemResolution(index, resolution)}
                    onSwap={(productId) => swapProduct(index, productId)}
                    onQty={(qty) => {
                      updateItem(index, { qty });
                      setItems((prev) =>
                        prev.map((row, i) => (i === index ? { ...row, qty } : row)),
                      );
                    }}
                    onPlaceInRoom={(checked) => updateItem(index, { placeInRoom: checked })}
                    onUseCommunityModel={(match) => useCommunityModel(index, match)}
                    onRemove={() => removeResolvedItemAt(index)}
                  />
                ))
              : items.map((item, index) => (
                  <FurnitureListRow
                    key={`${item.query}-${index}`}
                    item={item}
                    index={index}
                    disabled={disabled || generating || submitting}
                    communityMatches={communityByQuery[item.query.trim()]}
                    communityLoading={communityLoadingQueries.has(item.query.trim())}
                    catalogMatchPending={catalogLoading}
                    resolution={itemResolutions.get(index) ?? null}
                    onSetResolution={(resolution) => setItemResolution(index, resolution)}
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
                    onRemove={() => removeListItemAt(index)}
                  />
                ))}
          </div>

          <div className="agentic-room-flow__enhance">
            <Field label="Optional: suggest more items with AI">
              <textarea
                className="kit-input agentic-room-flow__textarea agentic-room-flow__textarea--compact"
                value={enhancePrompt}
                onChange={(e) => setEnhancePrompt(e.target.value)}
                placeholder={
                  isManualList
                    ? 'e.g. add a dresser, mirror, and more decor for a gothic dorm'
                    : 'Add more items based on your room description'
                }
                rows={2}
                disabled={disabled || generating || submitting || enhancing}
              />
            </Field>
            <Button
              size="sm"
              variant="outline"
              disabled={
                disabled ||
                generating ||
                submitting ||
                enhancing ||
                !(enhancePrompt.trim() || prompt.trim())
              }
              onClick={() => void runEnhanceWithAi()}
            >
              {enhancing ? 'Suggesting…' : 'Add AI suggestions'}
            </Button>
          </div>

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
              disabled={disabled || submitting || !canCreateRoom}
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