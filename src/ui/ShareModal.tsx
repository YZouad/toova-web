import { useCallback, useEffect, useState } from 'react';
import { buildShareUrl } from '../lib/shareLinks';
import {
  createRoomShare,
  listRoomShares,
  removeRoomCollaborator,
  revokeRoomShare,
  updateRoomShareAllowCopy,
  type RoomShareRow,
  type ShareRole,
} from '../lib/roomShares';
import {
  fetchRoomAttribution,
  listRoomCollaboratorProfiles,
  type CollaboratorProfileRow,
} from '../lib/profiles';
import { navigate, profilePath } from '../hooks/useRoute';

interface ShareModalProps {
  roomId: string;
  userId: string;
  onClose: () => void;
}

export function ShareModal({ roomId, userId, onClose }: ShareModalProps) {
  const [shares, setShares] = useState<RoomShareRow[]>([]);
  const [collaborators, setCollaborators] = useState<CollaboratorProfileRow[]>([]);
  const [forkCount, setForkCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<ShareRole>('viewer');
  const [allowCopy, setAllowCopy] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, c, meta] = await Promise.all([
        listRoomShares(roomId),
        listRoomCollaboratorProfiles(roomId),
        fetchRoomAttribution(roomId).catch(() => null),
      ]);
      setShares(s);
      setCollaborators(c);
      setForkCount(meta?.fork_count ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load share settings.');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const { token, url } = await createRoomShare(roomId, userId, {
        role: newRole,
        allowCopy,
      });
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create link.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy(token: string) {
    try {
      await navigator.clipboard.writeText(buildShareUrl(token));
      setCopiedToken(token);
    } catch {
      setError('Could not copy to clipboard.');
    }
  }

  async function handleRevoke(token: string) {
    setBusy(true);
    setError(null);
    try {
      await revokeRoomShare(token);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not revoke link.');
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleCopy(token: string, next: boolean) {
    setBusy(true);
    setError(null);
    try {
      await updateRoomShareAllowCopy(token, next);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update link.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveCollaborator(uid: string) {
    setBusy(true);
    setError(null);
    try {
      await removeRoomCollaborator(roomId, uid);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove collaborator.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="share-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="share-modal"
        role="dialog"
        aria-labelledby="share-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="share-modal-header">
          <h2 id="share-modal-title">Share room</h2>
          <button type="button" className="share-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <p className="share-modal-hint">
          Anyone with a link can view this room. Editor links grant write access when redeemed — treat them like passwords.
          {forkCount > 0 ? ` ${forkCount} copies have been made of this room.` : ''}
        </p>

        {error ? (
          <div className="tv-banner-error" role="alert">{error}</div>
        ) : null}

        <div className="share-create">
          <label className="share-field">
            <span>Link type</span>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as ShareRole)}
              disabled={busy}
            >
              <option value="viewer">Viewer (recommended)</option>
              <option value="editor">Editor</option>
            </select>
          </label>
          <label className="share-check">
            <input
              type="checkbox"
              checked={allowCopy}
              onChange={(e) => setAllowCopy(e.target.checked)}
              disabled={busy}
            />
            Allow “Make a copy”
          </label>
          {newRole === 'editor' ? (
            <p className="share-warn">
              Editor links let anyone who opens them save changes to your room (last write wins).
            </p>
          ) : null}
          <button
            type="button"
            className="tv-btn-primary"
            disabled={busy}
            onClick={() => void handleCreate()}
          >
            Create link &amp; copy
          </button>
        </div>

        <div className="share-section">
          <h3>Active links</h3>
          {loading ? (
            <p className="share-muted">Loading…</p>
          ) : shares.length === 0 ? (
            <p className="share-muted">No active links yet.</p>
          ) : (
            <ul className="share-list">
              {shares.map((s) => (
                <li key={s.token} className="share-list-item">
                  <div>
                    <div className="share-list-title">
                      {s.role === 'editor' ? 'Editor' : 'Viewer'} · {s.view_count} views
                    </div>
                    <div className="share-list-url">{buildShareUrl(s.token)}</div>
                    <label className="share-check share-check--compact">
                      <input
                        type="checkbox"
                        checked={s.allow_copy}
                        disabled={busy}
                        onChange={(e) => void handleToggleCopy(s.token, e.target.checked)}
                      />
                      Allow copies
                    </label>
                  </div>
                  <div className="share-list-actions">
                    <button type="button" disabled={busy} onClick={() => void handleCopy(s.token)}>
                      {copiedToken === s.token ? 'Copied' : 'Copy'}
                    </button>
                    <button type="button" disabled={busy} onClick={() => void handleRevoke(s.token)}>
                      Revoke
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="share-section">
          <h3>Collaborators</h3>
          <p className="share-muted">
            Revoking a link does not remove people who already redeemed an editor link.
          </p>
          {collaborators.length === 0 ? (
            <p className="share-muted">No collaborators yet.</p>
          ) : (
            <ul className="share-list">
              {collaborators.map((c) => (
                <li key={c.user_id} className="share-list-item">
                  <div>
                    <div className="share-list-title">
                      {c.display_name}
                      {c.handle ? (
                        c.is_public ? (
                          <>
                            {' · '}
                            <button
                              type="button"
                              className="share-handle-link"
                              onClick={() => navigate(profilePath(c.handle!))}
                            >
                              @{c.handle}
                            </button>
                          </>
                        ) : (
                          ` · @${c.handle}`
                        )
                      ) : null}
                    </div>
                    <div className="share-list-url">{c.role} access</div>
                  </div>
                  <div className="share-list-actions">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleRemoveCollaborator(c.user_id)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
