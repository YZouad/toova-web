import { useEffect, useRef, useState } from 'react';
import { useGlbRevisionCompare } from '../hooks/useGlbRevisionCompare';
import { useThrixelCredits } from '../hooks/useThrixelCredits';
import {
  canDetail,
  canEditOrAutofix,
  type ThrixelCatalogStage,
  type ThrixelRevisionOp,
} from '../lib/thrixelCatalogAssets';
import { canAffordOperation, estimateOperationCost } from '../lib/thrixelCosts';
import { runThrixelImportRevision } from '../lib/thrixelRevise';
import { GlbRevisionCompare } from './GlbRevisionCompare';
import { Banner, Button, Field, Input, MonoMeta } from './kit';
import { ThrixelCreditsBanner } from './ThrixelCreditsBanner';

export const REVISION_SUCCESS_MSG = 'Revision complete — preview updated';

export interface ThrixelImportRevisePanelProps {
  submissionId: string;
  stage: ThrixelCatalogStage;
  previewFile: File | null;
  disabled?: boolean;
  onRevised: (result: {
    glbFile: File;
    uploadFile: File;
    submissionId: string;
    stage: ThrixelCatalogStage;
    widthIn: string;
    heightIn: string;
    depthIn: string;
  }) => void;
}

const REDUCE_PRESETS = [10_000, 20_000, 50_000] as const;

type RevisionPhase = 'idle' | 'working' | 'success';

export function ThrixelImportRevisePanel({
  submissionId,
  stage,
  previewFile,
  disabled = false,
  onRevised,
}: ThrixelImportRevisePanelProps) {
  const credits = useThrixelCredits(true);
  const compare = useGlbRevisionCompare();
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
  const previewFileRef = useRef(previewFile);
  previewFileRef.current = previewFile;

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
    if (busyOp || disabled) return;
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

    const beforeFile = previewFileRef.current;
    if (beforeFile) compare.snapshotBefore(beforeFile);

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setBusyOp(op);
    setPhase('working');
    setElapsedSec(0);
    setStatus('Submitting to Thrixel…');
    const startedAt = Date.now();

    try {
      const result = await runThrixelImportRevision({
        submissionId,
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
      compare.setAfterFromFile(result.uploadFile);
      onRevised(result);
      void credits.refresh();
      if (op === 'edit') setEditPrompt('');
      const finishedSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      setPhase('success');
      setSuccessDetail(`Finished in ${finishedSec}s`);
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

  const showEdit = canEditOrAutofix(stage);
  const showDetail = canDetail(stage);
  const busy = phase === 'working';

  return (
    <section className="dg-import-thrixel-revise">
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
            disabled={busy || disabled}
            placeholder="The roof should be corrugated metal, rusted at the edges"
            onChange={(e) => setEditPrompt(e.target.value)}
          />
          <div style={{ marginTop: 8 }}>
            <Button
              size="sm"
              disabled={busy || disabled || !editPrompt.trim() || credits.connected === false}
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
          <Button
            size="sm"
            variant="outline"
            disabled={busy || disabled || credits.connected === false}
            onClick={() => void runOp('autofix')}
          >
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
          disabled={busy || disabled}
          placeholder="Optional look, e.g. weathered oak with brass fittings"
          onChange={(e) => setRetexturePrompt(e.target.value)}
        />
        <div style={{ marginTop: 8 }}>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || disabled || credits.connected === false}
            onClick={() => void runOp('retexture')}
          >
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
            disabled={busy || disabled}
            placeholder="Optional finished look"
            onChange={(e) => setDetailPrompt(e.target.value)}
          />
          <div style={{ marginTop: 8 }}>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || disabled || credits.connected === false}
              onClick={() => void runOp('detail')}
            >
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
              disabled={busy || disabled}
              onClick={() => setReduceTarget(preset)}
            >
              {(preset / 1000).toFixed(0)}k
            </Button>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || disabled || credits.connected === false}
          onClick={() => void runOp('reduce')}
        >
          Reduce to {(reduceTarget / 1000).toFixed(0)}k triangles
        </Button>
      </Field>
    </section>
  );
}
