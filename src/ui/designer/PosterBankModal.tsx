import { useEffect, useMemo, useState } from 'react';
import { loadPosterBankOptions, type PosterBankOption } from '../../lib/posterBank';
import { posterKindForItem } from '../../lib/posterItem';
import { useStore } from '../../store';
import { Banner, EmptyState, MonoMeta, Spinner } from '../kit';
import { Modal } from '../kit/Modal';

interface PosterBankModalProps {
  open: boolean;
  itemId: string | null;
  onClose: () => void;
}

export function PosterBankModal({ open, itemId, onClose }: PosterBankModalProps) {
  const item = useStore((s) => (itemId ? s.items[itemId] : null));
  const swapPosterItem = useStore((s) => s.swapPosterItem);

  const [options, setOptions] = useState<PosterBankOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swappingKind, setSwappingKind] = useState<string | null>(null);

  const activeKind = useMemo(() => (item ? posterKindForItem(item) : null), [item]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadPosterBankOptions()
      .then((loaded) => {
        if (!cancelled) setOptions(loaded);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load posters');
          setOptions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handlePick = async (option: PosterBankOption) => {
    if (!itemId || !item || option.kind === activeKind) {
      onClose();
      return;
    }
    if (!option.signedUrl) {
      setError('This poster is not available right now.');
      return;
    }

    setSwappingKind(option.kind);
    setError(null);
    try {
      swapPosterItem(itemId, {
        label: option.label,
        catalogKind: option.kind,
        url: option.signedUrl,
        storagePath: option.modelPath,
        size: [option.widthIn, option.heightIn, option.depthIn],
        catalogTags: option.tags.length ? option.tags : ['poster'],
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not swap poster');
    } finally {
      setSwappingKind(null);
    }
  };

  const curated = options.filter((o) => o.isCurated);
  const custom = options.filter((o) => !o.isCurated);

  return (
    <Modal
      open={open}
      title="Choose a poster"
      meta={item ? `Replacing ${item.label}` : undefined}
      onClose={onClose}
      width={720}
      className="dg-poster-bank"
      scrimClassName="dg-poster-bank__scrim"
    >
      {error ? <Banner tone="error">{error}</Banner> : null}

      {loading ? (
        <Spinner label="Loading posters…" style={{ padding: '32px 0' }} />
      ) : null}

      {!loading && options.length === 0 ? (
        <EmptyState label="No posters" title="No poster options are available yet." />
      ) : null}

      {!loading && curated.length > 0 ? (
        <section className="dg-poster-bank__section">
          <MonoMeta size="sm" tone="dense" upper>
            Toova posters
          </MonoMeta>
          <div className="dg-poster-bank__grid">
            {curated.map((option) => (
              <PosterBankCard
                key={option.kind}
                option={option}
                active={option.kind === activeKind}
                busy={swappingKind === option.kind}
                onPick={() => void handlePick(option)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {!loading && custom.length > 0 ? (
        <section className="dg-poster-bank__section">
          <MonoMeta size="sm" tone="dense" upper>
            Your posters
          </MonoMeta>
          <div className="dg-poster-bank__grid">
            {custom.map((option) => (
              <PosterBankCard
                key={option.kind}
                option={option}
                active={option.kind === activeKind}
                busy={swappingKind === option.kind}
                onPick={() => void handlePick(option)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </Modal>
  );
}

function PosterBankCard({
  option,
  active,
  busy,
  onPick,
}: {
  option: PosterBankOption;
  active: boolean;
  busy: boolean;
  onPick: () => void;
}) {
  const [imgBroken, setImgBroken] = useState(false);
  const previewUrl = option.previewUrl;
  const showImg = !!previewUrl && !imgBroken;

  useEffect(() => {
    setImgBroken(false);
  }, [previewUrl]);

  const aspectRatio =
    option.widthIn > 0 && option.heightIn > 0
      ? `${option.widthIn} / ${option.heightIn}`
      : '2 / 3';

  return (
    <button
      type="button"
      className={`dg-poster-bank__card${active ? ' is-active' : ''}`}
      disabled={busy}
      aria-pressed={active}
      onClick={onPick}
    >
      <div className="dg-poster-bank__thumb" style={{ aspectRatio }} aria-hidden>
        {showImg ? (
          <img
            src={previewUrl}
            alt=""
            draggable={false}
            onError={() => setImgBroken(true)}
          />
        ) : (
          <span className="dg-poster-bank__thumb-fallback" />
        )}
        {active ? <span className="dg-poster-bank__badge">Current</span> : null}
      </div>
      <span className="dg-poster-bank__label">{option.label}</span>
    </button>
  );
}
