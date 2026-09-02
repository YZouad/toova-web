import { useState } from 'react';
import { useRoomWorkspace } from '../context/RoomWorkspaceContext';
import { useAdminStats } from '../hooks/useAdminStats';
import { useAuth } from '../hooks/useAuth';
import { useRoomSave } from '../hooks/useRoomLayout';
import { useUserCatalog } from '../hooks/useUserCatalog';
import { recordCatalogDownload, shouldRecordCatalogDownload } from '../lib/catalogEngagement';
import { useStore } from '../store';
import { FURNITURE } from '../furniture/registry';
import { ImportModelModal } from './ImportModelModal';
import { Button } from './kit/Button';

export function Sidebar() {
  const { user, logout } = useAuth();
  const { isAdmin } = useAdminStats(user?.id ?? null);
  const { workspace, exitWorkspace } = useRoomWorkspace();
  const { save, saving, error: saveError } = useRoomSave(workspace?.id ?? null);
  const addItem = useStore((s) => s.addItem);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const { catalog: userCatalog, loading: userCatalogLoading, error: userCatalogError, refresh } =
    useUserCatalog(Boolean(user?.id));

  return (
    <aside className="sidebar">
      <h2>Furniture</h2>
      <div className="palette">
        {(Object.keys(FURNITURE) as Array<keyof typeof FURNITURE>).map((key) => (
          <button
            key={key}
            className="tile"
            onClick={() => addItem(FURNITURE[key].kind)}
          >
            {FURNITURE[key].label}
          </button>
        ))}
      </div>

      <h2 className="sidebar-subheading">Community models</h2>
      {userCatalogError ? (
        <div className="sidebar-catalog-error" role="alert">
          {userCatalogError}
        </div>
      ) : null}
      {userCatalogLoading ? (
        <p className="empty-hint">Loading uploads…</p>
      ) : userCatalog.length === 0 ? (
        <p className="empty-hint">No uploaded models yet. Be the first to import one below.</p>
      ) : (
        <div className="palette">
          {userCatalog.map((entry) => (
            <button
              key={entry.kind}
              type="button"
              className="tile"
              disabled={!entry.signedUrl}
              title={
                entry.visibility === 'public'
                  ? `${entry.likesCount} likes · ${entry.downloadsCount} downloads · ${entry.viewsCount} views`
                  : entry.visibility === 'unlisted'
                    ? 'Unlisted'
                    : 'Private (only you)'
              }
              onClick={() => {
                if (!entry.signedUrl) return;
                addItem('imported', {
                  url: entry.signedUrl,
                  storagePath: entry.storagePath || undefined,
                  label: entry.label,
                  size: [entry.width_in, entry.height_in, entry.depth_in],
                  catalogSizeIn: [entry.width_in, entry.height_in, entry.depth_in],
                  catalogKind: entry.kind,
                });
                if (shouldRecordCatalogDownload(entry, user?.id)) {
                  void recordCatalogDownload(entry.kind).catch(() => {
                    /* best-effort metric */
                  });
                }
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}

      <Button size="sm" variant="outline" full type="button" onClick={() => setImportModalOpen(true)} disabled={!user?.id}>
        Import model
      </Button>

      {user?.id ? (
        <ImportModelModal
          userId={user.id}
          open={importModalOpen}
          isAdmin={isAdmin}
          onClose={() => setImportModalOpen(false)}
          onAdded={() => refresh()}
        />
      ) : null}

      <footer className="sidebar-footer">
        <div className="sidebar-room" title="Active room">{workspace?.name ?? ''}</div>
        <Button size="sm" disabled={saving || !workspace} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save room'}
        </Button>
        {saveError ? (
          <div className="sidebar-save-error" role="alert">
            {saveError}
          </div>
        ) : null}
        <button type="button" className="sidebar-switch-room" onClick={() => exitWorkspace()}>
          Switch room
        </button>
        <div className="sidebar-account" title="Signed-in user">
          {user?.email}
        </div>
        <button type="button" className="sidebar-logout" onClick={() => void logout()}>
          Sign out
        </button>
      </footer>
    </aside>
  );
}
