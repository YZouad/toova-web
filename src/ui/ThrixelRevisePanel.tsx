import { useEffect, useRef, useState } from 'react';
import type { GalleryModel } from '../hooks/useGalleryCatalog';
import { useGlbRevisionCompare } from '../hooks/useGlbRevisionCompare';
import { useThrixelCredits } from '../hooks/useThrixelCredits';
import {
  CATALOG_THRIXEL_ASSETS_MISSING_MSG,
  canDetail,
  canEditOrAutofix,
  fetchCatalogThrixelAsset,
  type CatalogThrixelAsset,
  type ThrixelRevisionOp,
} from '../lib/thrixelCatalogAssets';
import { canAffordOperation, estimateOperationCost } from '../lib/thrixelCosts';
import { resolveBrowsableModelUrl } from '../lib/modelStorage';
import { runThrixelRevision } from '../lib/thrixelRevise';
import { GlbRevisionCompare } from './GlbRevisionCompare';
import { REVISION_SUCCESS_MSG } from './ThrixelImportRevisePanel';
import { Banner, Button, Field, Input, MonoMeta } from './kit';
import { ThrixelCreditsBanner } from './ThrixelCreditsBanner';

export interface ThrixelRevisePanelProps {
  model: GalleryModel;
  userId: string;
  onRevised: (patch: Partial<GalleryModel> & { thrixelStage?: CatalogThrixelAsset['stage'] }) => void;
  onRoomItemsUpdated?: (storagePath: string) => void;
}

const REDUCE_PRESETS = [10_000, 20_000, 50_000] as const;

type RevisionPhase = 'idle' | 'working' | 'success';

export function ThrixelRevisePanel({ model, userId, onRevised, onRoomItemsUpdated }: ThrixelRevisePanelProps) {
  const credits = useThrixelCredits(true);
  const compare = useGlbRevisionCompare();
  const [asset, setAsset] = useState<CatalogThrixelAsset | null>(null);
  const [assetLoading, setAssetLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [retexturePrompt, setRetexturePrompt] = useState('');
  const [detailPrompt, setDetailPrompt] = useState('');
  const [reduceTarget, setReduceTarget] = useState<number>(20_000);
  const [busyOp, setBusyOp] = useState<ThrixelRevisionOp | null>(null);
  const [phase, setPhase] = useState<RevisionPhase>('idle');
  const [status, setStatus] = useState<string | null>(null);
  const [successDetail, setSuccessDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const modelRef = useRef(model);
  modelRef.current = model;

  useEffect(() => {
    let cancelled = false;
    setAssetLoading(true);
    void fetchCatalogThrixelAsset(model.kind).then((result) => {
      if (!cancelled) {
        setAsset(result.asset);
        setTableMissing(result.tableMissing);
        setAssetLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [model.kind]);

  useEffect(() => {
    if (phase !== 'working') return;
    const t = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  async function runOp(op: ThrixelRevisionOp) {
    if (!asset || busyOp) return;
    setError(null);
    setSuccessDetail(null);
    setPhase('idle');
    const cost = estimateOperationCost(op, credits.pricing, {
      hasPrompt:
        (op === 'retexture' && Boolean(retexturePrompt.trim())) ||
        (op === 'detail' && Boolean(detailPrompt.trim())),
    });
    if (!canAffordOperation(credits.account, cost)) {
      setError('Not enough Thrixel cubes for this operation.');
      return;
    }

    const beforeUrl = modelRef.current.signedUrl;
    if (beforeUrl) compare.snapshotBeforeFromUrl(beforeUrl);

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setBusyOp(op);
    setPhase('working');
    setElapsedSec(0);
    setStatus('Submitting to Thrixel…');
    const startedAt = Date.now();

    try {
      const result = await runThrixelRevision({
        userId,
        model: modelRef.current,
        submissionId: asset.submissionId,
        op,
        change: op === 'edit' ? editPrompt : undefined,
        prompt:
          op === 'retexture'
            ? retexturePrompt
            : op === 'detail'
              ? detailPrompt
              : undefined,
        targetTriangles: op === 'reduce' ? reduceTarget : undefined,
        signal: abort.signal,
        onProgress: setStatus,
      });

      const access = modelRef.current.visibility === 'public' ? 'public' : 'private';
      const afterUrl = await resolveBrowsableModelUrl(result.storagePath, { access });
      if (afterUrl) compare.setAfterFromUrl(afterUrl);

      setAsset({
        kind: model.kind,
        submissionId: result.submissionId,
        stage: result.stage,
      });
      onRevised({
        width_in: result.widthIn,
        height_in: result.heightIn,
        depth_in: result.depthIn,
        storagePath: result.storagePath,
        thrixelStage: result.stage,
      });
      onRoomItemsUpdated?.(result.storagePath);
      void credits.refresh();
      if (op === 'edit') setEditPrompt('');

      const finishedSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      setPhase('success');
      setSuccessDetail(
        result.updatedRoomItems > 0
          ? `Finished in ${finishedSec}s · updated ${result.updatedRoomItems} placed piece${result.updatedRoomItems === 1 ? '' : 's'}`
          : `Finished in ${finishedSec}s`,
      );
      setStatus(REVISION_SUCCESS_MSG);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Revision failed.');
      setPhase('idle');
      setStatus(null);
      void credits.refresh();
    } finally {
      if (abortRef.current === abort) abortRef.current = null;
      setBusyOp(null);
    }
  }

  if (assetLoading) {
    return <MonoMeta size="sm" tone="subtle">Checking Thrixel link…</MonoMeta>;
  }
  if (tableMissing) {
    return (
      <section style={{ marginTop: 24 }}>
        <Banner tone="error">{CATALOG_THRIXEL_ASSETS_MISSING_MSG}</Banner>
      </section>
    );
  }
  if (!asset) return null;

  const showEdit = canEditOrAutofix(asset.stage);
  const showDetail = canDetail(asset.stage);
  const busy = phase === 'working';

  return (
    <section style={{ display: 'grid', gap: 16, marginTop: 24 }}>
      <div>
        <MonoMeta size="xs" tone="subtle" style={{ display: 'block', marginBottom: 8 }}>
          REVISE WITH THRIXEL
        </MonoMeta>
        <ThrixelCreditsBanner
          balanceLabel={credits.balanceLabel}
          plan={credits.account?.plan ?? null}
          loading={credits.loading}
          error={credits.error}
          compact
        />
      </div>

      {compare.hasCompare ? (
        <GlbRevisionCompare beforeUrl={compare.beforeUrl} afterUrl={compare.afterUrl} compact />
      ) : null}

      {phase === 'working' ? (
        <Banner tone="info">
          {status ?? 'Working with Thrixel…'} · {elapsedSec}s
        </Banner>
      ) : null}
      {phase === 'success' && status ? (
        <Banner tone="success">
          {status}
          {successDetail ? ` · ${successDetail}` : ''}
        </Banner>
      ) : null}
      {error ? <Banner tone="error">{error}</Banner> : null}

      {showEdit ? (
        <Field label="Edit shape">
          <MonoMeta size="xs" tone="subtle" style={{ display: 'block', marginBottom: 8 }}>
            {credits.costLine('edit')}
          </MonoMeta>
          <Input
            value={editPrompt}
            disabled={busy}
            placeholder="The roof should be corrugated metal, rusted at the edges"
            onChange={(e) => setEditPrompt(e.target.value)}
          />
          <div style={{ marginTop: 8 }}>
            <Button
              size="sm"
              disabled={busy || !editPrompt.trim() || credits.connected === false}
              onClick={() => void runOp('edit')}
            >
              Edit model
            </Button>
          </div>
        </Field>
      ) : null}

      {showEdit ? (
        <Field label="Autofix">
          <MonoMeta size="xs" tone="subtle" style={{ display: 'block', marginBottom: 8 }}>
            {credits.costLine('autofix')}
          </MonoMeta>
          <Button size="sm" variant="outline" disabled={busy || credits.connected === false} onClick={() => void runOp('autofix')}>
            Run autofix
          </Button>
        </Field>
      ) : null}

      <Field label="Retexture">
        <MonoMeta size="xs" tone="subtle" style={{ display: 'block', marginBottom: 8 }}>
          {credits.costLine('retexture', { hasPrompt: Boolean(retexturePrompt.trim()) })}
        </MonoMeta>
        <Input
          value={retexturePrompt}
          disabled={busy}
          placeholder="Optional look, e.g. weathered oak with brass fittings"
          onChange={(e) => setRetexturePrompt(e.target.value)}
        />
        <div style={{ marginTop: 8 }}>
          <Button size="sm" variant="outline" disabled={busy || credits.connected === false} onClick={() => void runOp('retexture')}>
            Retexture
          </Button>
        </div>
      </Field>

      {showDetail ? (
        <Field label="Detail (terminal)">
          <MonoMeta size="xs" tone="subtle" style={{ display: 'block', marginBottom: 8 }}>
            {credits.costLine('detail', { hasPrompt: Boolean(detailPrompt.trim()) })}
          </MonoMeta>
          <Banner tone="info" style={{ marginBottom: 8 }}>
            Detail is final — you cannot edit the shape afterwards. Get the shape right with Edit first.
          </Banner>
          <Input
            value={detailPrompt}
            disabled={busy}
            placeholder="Optional finished look"
            onChange={(e) => setDetailPrompt(e.target.value)}
          />
          <div style={{ marginTop: 8 }}>
            <Button size="sm" variant="outline" disabled={busy || credits.connected === false} onClick={() => void runOp('detail')}>
              Detail model
            </Button>
          </div>
        </Field>
      ) : null}

      <Field label="Reduce triangles">
        <MonoMeta size="xs" tone="subtle" style={{ display: 'block', marginBottom: 8 }}>
          {credits.costLine('reduce')}
        </MonoMeta>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {REDUCE_PRESETS.map((preset) => (
            <Button
              key={preset}
              size="sm"
              variant={reduceTarget === preset ? 'primary' : 'outline'}
              disabled={busy}
              onClick={() => setReduceTarget(preset)}
            >
              {(preset / 1000).toFixed(0)}k
            </Button>
          ))}
        </div>
        <Button size="sm" variant="outline" disabled={busy || credits.connected === false} onClick={() => void runOp('reduce')}>
          Reduce to {(reduceTarget / 1000).toFixed(0)}k triangles
        </Button>
      </Field>

      <MonoMeta size="xs" tone="subtle">
        Top up cubes on{' '}
        <a href="https://thrixel.com/create/#settings/api-keys" target="_blank" rel="noreferrer">
          thrixel.com
        </a>
        .
      </MonoMeta>
    </section>
  );
}
