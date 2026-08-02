import { useEffect, useState } from 'react';
import {
  buildShareUrl,
  createRoomShare,
  listRoomShares,
  revokeRoomShare,
} from '../lib/roomShares';

interface ShareModalProps {
  roomId: string;
  roomName: string;
  onClose: () => void;
}

export function ShareModal({ roomId, roomName, onClose }: ShareModalProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const existing = await listRoomShares(roomId);
        const viewer = existing.find((s) => s.role === 'viewer');
        if (!cancelled && viewer) setUrl(buildShareUrl(String(viewer.token)));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  async function createLink() {
    setBusy(true);
    setError(null);
    try {
      const created = await createRoomShare(roomId, { role: 'viewer', allowCopy: true });
      setUrl(created.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create link');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy to clipboard');
    }
  }

  async function revoke() {
    if (!url) return;
    const token = url.split('/r/').pop();
    if (!token) return;
    setBusy(true);
    try {
      await revokeRoomShare(decodeURIComponent(token));
      setUrl(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not revoke link');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="product-drawer-backdrop" role="presentation" onClick={onClose}>
      <div
        className="share-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Share room"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="product-drawer-head">
          <div>
            <p className="product-drawer-eyebrow">Share</p>
            <h2 className="product-drawer-title">{roomName}</h2>
          </div>
          <button type="button" className="product-drawer-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <p className="share-modal-copy">
          Create a view-only link. Visitors can browse items in To buy and shop affiliate picks
          without editing your room.
        </p>
        {error ? <p className="share-modal-error" role="alert">{error}</p> : null}
        {url ? (
          <>
            <input className="share-modal-input" readOnly value={url} />
            <div className="share-modal-actions">
              <button type="button" className="tv-btn-primary" onClick={() => void copyLink()}>
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <button
                type="button"
                className="tv-btn-ghost product-drawer-btn"
                disabled={busy}
                onClick={() => void revoke()}
              >
                Revoke
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="tv-btn-primary"
            disabled={busy}
            onClick={() => void createLink()}
          >
            {busy ? 'Creating…' : 'Create view link'}
          </button>
        )}
      </div>
    </div>
  );
}
