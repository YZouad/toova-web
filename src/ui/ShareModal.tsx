import { useCallback, useEffect, useState } from 'react';
import { trackShareRoom } from '../lib/analytics';
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
import { Button } from './kit/Button';
import { Checkbox } from './kit/Checkbox';
import { Field } from './kit/Field';
import { Modal } from './kit/Modal';
import { MonoMeta } from './kit/MonoMeta';
import { RuledTable } from './kit/RuledTable';
import { Select } from './kit/Select';
import { Spinner } from './kit/Spinner';

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
      trackShareRoom({ role: newRole });
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
    <Modal
      open
      meta="Share room"
      title="Invite viewers or editors."
      onClose={onClose}
      width={640}
    >
      <p style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
        Anyone with a link can view this room. Editor links grant write access when redeemed — treat them like passwords.
        {forkCount > 0 ? ` ${forkCount} copies have been made of this room.` : ''}
      </p>

      {error ? (
        <div className="tv-banner-error" role="alert" style={{ marginBottom: 16 }}>{error}</div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
        <Field label="Link type">
          <Select
            value={newRole}
            onChange={(v) => setNewRole(v as ShareRole)}
            disabled={busy}
            options={[
              { value: 'viewer', label: 'Viewer (recommended)' },
              { value: 'editor', label: 'Editor' },
            ]}
          />
        </Field>
        <Checkbox
          checked={allowCopy}
          label='Allow "Make a copy"'
          onChange={setAllowCopy}
          disabled={busy}
        />
        {newRole === 'editor' ? (
          <MonoMeta size="sm" tone="dense" style={{ color: 'var(--danger)' }}>
            Editor links let anyone who opens them save changes to your room (last write wins).
          </MonoMeta>
        ) : null}
        <Button size="sm" disabled={busy} onClick={() => void handleCreate()}>
          Create link &amp; copy
        </Button>
      </div>

      <MonoMeta size="xs" tone="dense" upper style={{ display: 'block', marginBottom: 12 }}>
        Active links
      </MonoMeta>
      {loading ? (
        <Spinner label="Loading links…" />
      ) : shares.length === 0 ? (
        <MonoMeta size="sm" tone="dense">No active links yet.</MonoMeta>
      ) : (
        <RuledTable
          columns={[
            { label: 'Link' },
            { label: 'Views', align: 'right' },
            { label: 'Actions', align: 'right' },
          ]}
          rows={shares.map((s) => [
            <div key={`${s.token}-meta`}>
              <div style={{ font: 'var(--type-ui-sm)', color: 'var(--text-heading)' }}>
                {s.role === 'editor' ? 'Editor' : 'Viewer'}
              </div>
              <MonoMeta size="xs" tone="dense">{buildShareUrl(s.token)}</MonoMeta>
              <Checkbox
                checked={s.allow_copy}
                label="Allow copies"
                onChange={(next) => void handleToggleCopy(s.token, next)}
                disabled={busy}
                style={{ marginTop: 8 }}
              />
            </div>,
            String(s.view_count),
            <div key={`${s.token}-actions`} style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void handleCopy(s.token)}>
                {copiedToken === s.token ? 'Copied' : 'Copy'}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void handleRevoke(s.token)} style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>
                Revoke
              </Button>
            </div>,
          ])}
        />
      )}

      <MonoMeta size="xs" tone="dense" upper style={{ display: 'block', margin: '24px 0 12px' }}>
        Collaborators
      </MonoMeta>
      <MonoMeta size="sm" tone="dense" style={{ display: 'block', marginBottom: 12 }}>
        Revoking a link does not remove people who already redeemed an editor link.
      </MonoMeta>
      {collaborators.length === 0 ? (
        <MonoMeta size="sm" tone="dense">No collaborators yet.</MonoMeta>
      ) : (
        <RuledTable
          columns={[{ label: 'Person' }, { label: 'Access', align: 'right' }, { label: '', align: 'right' }]}
          rows={collaborators.map((c) => [
            <div key={c.user_id}>
              <div style={{ font: 'var(--type-ui-sm)' }}>{c.display_name}</div>
              {c.handle ? (
                c.is_public ? (
                  <button type="button" className="share-handle-link" onClick={() => navigate(profilePath(c.handle!))}>
                    @{c.handle}
                  </button>
                ) : (
                  <MonoMeta size="xs" tone="dense">@{c.handle}</MonoMeta>
                )
              ) : null}
            </div>,
            c.role,
            <Button key={`${c.user_id}-rm`} size="sm" variant="outline" disabled={busy} onClick={() => void handleRemoveCollaborator(c.user_id)}>
              Remove
            </Button>,
          ])}
        />
      )}
    </Modal>
  );
}
