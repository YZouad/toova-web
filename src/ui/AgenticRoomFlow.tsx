import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FloorPlan } from '../lib/floorPlanGeometry';
import { rectanglePlan } from '../lib/floorPlanGeometry';
import {
  parseAgenticRoomPrompt,
  type AgenticRoomRequest,
  type AgenticVibeId,
} from '../lib/agenticRoomPrompt';
import { appearanceForAgenticVibe } from '../lib/agenticRoomVibe';
import {
  flattenCatalogProducts,
  formatAgenticPrice,
  resolveAgenticItems,
  type ResolvedAgenticItem,
} from '../lib/agenticRoomResolve';
import { shoppingEntriesFromResolved } from '../lib/agenticRoomApplyChecklist';
import { fetchPublishedShoppingCatalog } from '../lib/shoppingCatalog';
import type { CuratedProduct, ShoppingListEntry } from '../lib/dormChecklist';
import { FURNITURE } from '../furniture/registry';
import { DEFAULT_ENVIRONMENT, type RoomEnvironment } from '../store';
import { Banner, Button, Field, Input, Spinner } from './kit';
import { formatLength } from '../lib/floorPlanGeometry';

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

const EXAMPLE_PROMPT = '10 by 12, bed desk and lamp, under $400, sage vibe';

const VIBE_OPTIONS: { id: AgenticVibeId; label: string }[] = [
  { id: 'warm', label: 'Warm' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'studio', label: 'Studio' },
  { id: 'moody', label: 'Moody' },
  { id: 'sage', label: 'Sage' },
];

function ProductRow({
  item,
  disabled,
  onSwap,
  onQty,
  onRemove,
}: {
  item: ResolvedAgenticItem;
  disabled?: boolean;
  onSwap: (productId: string) => void;
  onQty: (qty: number) => void;
  onRemove: () => void;
}) {
  const product = item.product;
  const label = product?.name ?? (item.builtinKind ? FURNITURE[item.builtinKind].label : item.query);
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
              <a href={product.affiliateUrl} target="_blank" rel="noopener noreferrer">
                View product
              </a>
            ) : null}
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
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [request, setRequest] = useState<AgenticRoomRequest | null>(null);
  const [resolved, setResolved] = useState<ResolvedAgenticItem[]>([]);
  const [overBudget, setOverBudget] = useState(false);
  const [totalCents, setTotalCents] = useState(0);
  const [reviewed, setReviewed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  const runMatch = useCallback(() => {
    setParseError(null);
    setParseWarnings([]);
    setReviewed(false);
    const parsed = parseAgenticRoomPrompt(prompt);
    if (!parsed.ok) {
      setParseError(parsed.error);
      setRequest(null);
      setResolved([]);
      return;
    }
    setParseWarnings(parsed.warnings);
    setRequest(parsed.request);
    const result = resolveAgenticItems(parsed.request, products);
    setResolved(result.items);
    setOverBudget(result.overBudget);
    setTotalCents(result.totalCents);
    setReviewed(true);
  }, [prompt, products]);

  const updateItem = useCallback((index: number, patch: Partial<ResolvedAgenticItem>) => {
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
  }, [products, request]);

  const swapProduct = useCallback(
    (index: number, productId: string) => {
      const product = products.find((p) => p.id === productId);
      if (!product) return;
      updateItem(index, { product, builtinKind: null, warnings: [] });
    },
    [products, updateItem],
  );

  const sizeLabel = useMemo(() => {
    if (!request) return null;
    return `${formatLength(request.widthIn, 'ft-in')} × ${formatLength(request.depthIn, 'ft-in')}`;
  }, [request]);

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

  return (
    <div className="agentic-room-flow">
      <div className="agentic-room-flow__head">
        <Button size="sm" variant="outline" disabled={disabled || submitting} onClick={onBack}>
          ← Back
        </Button>
        <p className="room-preset-goal-hint">
          Describe your space and we&apos;ll match items from the shopping catalog.
        </p>
      </div>

      <Field label="Room description">
        <textarea
          className="kit-input agentic-room-flow__textarea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={EXAMPLE_PROMPT}
          rows={4}
          disabled={disabled || submitting || catalogLoading}
        />
      </Field>

      {catalogLoading ? (
        <p className="agentic-room-flow__status">
          <Spinner /> Loading catalog…
        </p>
      ) : null}
      {catalogError ? (
        <Banner tone="error">{catalogError}</Banner>
      ) : null}
      {parseError ? (
        <Banner tone="error">{parseError}</Banner>
      ) : null}

      <div className="agentic-room-flow__actions">
        <Button
          size="md"
          disabled={disabled || submitting || catalogLoading || !prompt.trim()}
          onClick={runMatch}
        >
          Find products
        </Button>
      </div>

      {parseWarnings.length > 0 ? (
        <div className="agentic-room-flow__warnings">
          {parseWarnings.map((w) => (
            <Banner key={w} tone="info">
              {w}
            </Banner>
          ))}
        </div>
      ) : null}

      {reviewed && request ? (
        <div className="agentic-room-flow__review">
          <div className="agentic-room-flow__summary">
            <Field label="Room size">
              <Input
                value={sizeLabel ?? ''}
                readOnly
                disabled
                aria-readonly
              />
            </Field>
            <Field label="Vibe">
              <select
                className="agentic-room-flow__vibe"
                value={request.vibe ?? 'neutral'}
                disabled={disabled || submitting}
                onChange={(e) => {
                  const vibe = e.target.value as AgenticVibeId;
                  setRequest({ ...request, vibe });
                }}
              >
                {VIBE_OPTIONS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </Field>
            {request.budgetCents != null ? (
              <p className="agentic-room-flow__budget">
                Budget: {formatAgenticPrice(request.budgetCents)}
                {overBudget ? (
                  <span className="agentic-room-flow__over-budget">
                    {' '}
                    — estimated {formatAgenticPrice(totalCents)} (over budget)
                  </span>
                ) : (
                  <span> — estimated {formatAgenticPrice(totalCents)}</span>
                )}
              </p>
            ) : (
              <p className="agentic-room-flow__budget">Estimated total: {formatAgenticPrice(totalCents)}</p>
            )}
          </div>

          {overBudget ? (
            <Banner tone="info">
              Selected products exceed your budget. Swap items or remove some before creating the room.
            </Banner>
          ) : null}

          <div className="agentic-room-flow__items">
            {resolved.map((item, index) => (
              <ProductRow
                key={`${item.query}-${index}`}
                item={item}
                disabled={disabled || submitting}
                onSwap={(productId) => swapProduct(index, productId)}
                onQty={(qty) => updateItem(index, { qty })}
                onRemove={() => setResolved((prev) => prev.filter((_, i) => i !== index))}
              />
            ))}
          </div>

          {resolved.length === 0 ? (
            <Banner tone="info">Add at least one item to continue.</Banner>
          ) : (
            <Button
              size="md"
              full
              disabled={disabled || submitting || resolved.every((i) => !i.product)}
              onClick={() => void handleConfirm()}
            >
              {submitting ? 'Creating…' : 'Create room & add to checklist'}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
