import { useEffect, useState } from 'react';
import { Scene } from '../scene/Scene';
import { useStore } from '../store';
import {
  forkSharedRoom,
  loadSharedRoomLayout,
  redeemShareToken,
  type SharedRoomLoadResult,
} from '../lib/roomShares';
import { SharedToBuyPanel } from './SharedToBuyPanel';
import { useAuth } from '../hooks/useAuth';
import { navigateToAppHome } from '../hooks/useRoute';
import type { CuratedProduct } from '../lib/dormChecklist';

interface SharedRoomPageProps {
  token: string;
  onOpenCopiedRoom?: (room: { id: string; name: string }) => void;
}

export function SharedRoomPage({ token, onOpenCopiedRoom }: SharedRoomPageProps) {
  const { user } = useAuth();
  const hydrateLayout = useStore((s) => s.hydrateLayout);
  const hydrateRoomSettings = useStore((s) => s.hydrateRoomSettings);
  const resetLayout = useStore((s) => s.resetLayout);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Pick<
    SharedRoomLoadResult,
    'roomName' | 'role' | 'allowCopy' | 'ownerDisplay' | 'productsById'
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await loadSharedRoomLayout(token);
        if (cancelled) return;
        hydrateLayout(result.items, result.order);
        hydrateRoomSettings(result.environment, result.roomGeometry);
        setMeta({
          roomName: result.roomName,
          role: result.role,
          allowCopy: result.allowCopy,
          ownerDisplay: result.ownerDisplay,
          productsById: result.productsById,
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not open share link');
          resetLayout();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, hydrateLayout, hydrateRoomSettings, resetLayout]);

  async function handleCopy() {
    if (!user) {
      setActionError('Sign in to make a copy of this room.');
      return;
    }
    if (!meta?.allowCopy) {
      setActionError('Copying is disabled for this link.');
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const roomId = await forkSharedRoom(token, `${meta.roomName} (copy)`);
      onOpenCopiedRoom?.({ id: roomId, name: `${meta.roomName} (copy)` });
      navigateToAppHome();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not copy room');
    } finally {
      setBusy(false);
    }
  }

  async function handleEdit() {
    if (!user) {
      setActionError('Sign in to edit with this link.');
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      if (meta?.role !== 'editor') {
        setActionError('This link is view-only. Make a copy to edit your own version.');
        return;
      }
      const roomId = await redeemShareToken(token);
      onOpenCopiedRoom?.({ id: roomId, name: meta.roomName });
      navigateToAppHome();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not open room');
    } finally {
      setBusy(false);
    }
  }

  const productsById: Record<string, CuratedProduct> = meta?.productsById ?? {};

  return (
    <div className="shared-page">
      <header className="shared-topbar">
        <button
          type="button"
          className="shared-brand"
          onClick={() => {
            resetLayout();
            navigateToAppHome();
          }}
        >
          <div className="tv-logo-mark" style={{ width: 25, height: 25, borderRadius: 7, fontSize: 17 }}>
            t
          </div>
          <span className="tv-logo-text" style={{ fontSize: 22 }}>Toova</span>
        </button>
        <div className="shared-topbar-meta">
          <strong>{meta?.roomName ?? 'Shared room'}</strong>
          <span>view only · {meta?.ownerDisplay ?? '…'}</span>
        </div>
        <div className="shared-topbar-actions">
          {meta?.allowCopy ? (
            <button
              type="button"
              className="tv-btn-ghost product-drawer-btn"
              disabled={busy || loading}
              onClick={() => void handleCopy()}
            >
              Make a copy
            </button>
          ) : null}
          <button
            type="button"
            className="tv-btn-primary"
            disabled={busy || loading}
            onClick={() => void handleEdit()}
          >
            Edit
          </button>
        </div>
      </header>

      {actionError ? <div className="shared-banner" role="alert">{actionError}</div> : null}
      {error ? <div className="shared-banner shared-banner--error" role="alert">{error}</div> : null}
      {loading ? <div className="shared-banner">Loading shared room…</div> : null}

      {!error ? (
        <div className="shared-canvas">
          <Scene readOnly />
          {!loading ? <SharedToBuyPanel productsById={productsById} /> : null}
        </div>
      ) : null}
    </div>
  );
}
