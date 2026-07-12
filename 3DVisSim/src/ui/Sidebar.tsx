import { useState } from 'react';
import { useRoomWorkspace } from '../context/RoomWorkspaceContext';
import { useAuth } from '../hooks/useAuth';
import { useRoomSave } from '../hooks/useRoomLayout';
import { useUserCatalog } from '../hooks/useUserCatalog';
import { useStore } from '../store';
import { FURNITURE } from '../furniture/registry';
import { ImportModelModal } from './ImportModelModal';

export function Sidebar() {
  const { user, logout } = useAuth();
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
              onClick={() => {
                if (!entry.signedUrl) return;
                addItem('imported', {
                  url: entry.signedUrl,
                  storagePath: entry.storagePath || undefined,
                  label: entry.label,
                  size: [entry.width_in, entry.height_in, entry.depth_in],
                });
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}

      <button
        className="import-btn"
        type="button"
        onClick={() => setImportModalOpen(true)}
        disabled={!user?.id}
      >
        Import Model
      </button>

      {user?.id ? (
        <ImportModelModal
          userId={user.id}
          open={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          onAdded={() => refresh()}
        />
      ) : null}

      <footer className="sidebar-footer">
        <div className="sidebar-room" title="Active room">{workspace?.name ?? ''}</div>
        <button
          type="button"
          className="sidebar-save"
          disabled={saving || !workspace}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Save room'}
        </button>
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
