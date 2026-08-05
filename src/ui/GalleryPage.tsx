import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import type { GalleryModel } from '../hooks/useGalleryCatalog';
import {
  buildGallerySearchParams,
  parseGallerySearchParams,
  type GalleryBrowseMode,
  type GallerySort,
  type GallerySource,
  type RoomGallerySortParam,
} from '../lib/galleryCatalog';
import { navigate } from '../hooks/useRoute';
import { GalleryHome } from './GalleryHome';
import { ModelGallery } from './ModelGallery';
import { RoomGallery } from './RoomGallery';

interface GalleryPageProps {
  loggedIn: boolean;
  onGoHome: () => void;
  onRequestAuth: (mode: 'signin' | 'signup') => void;
  onUseInRoom: (model: GalleryModel) => void;
}

const MODES: { id: GalleryBrowseMode; label: string }[] = [
  { id: 'discover', label: 'Discover' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'models', label: 'Models' },
];

const GALLERY_PATH_RE = /^\/gallery\/?$/i;

function isGalleryPathname(pathname = window.location.pathname): boolean {
  return GALLERY_PATH_RE.test(pathname.replace(/\/+$/, '') || '/');
}

export function GalleryPage({
  loggedIn,
  onGoHome,
  onRequestAuth,
  onUseInRoom,
}: GalleryPageProps) {
  const { user } = useAuth();
  const initial = parseGallerySearchParams(window.location.search);
  const [mode, setMode] = useState<GalleryBrowseMode>(initial.mode);
  const [source, setSource] = useState<GallerySource>(
    initial.source === 'mine' && !user ? 'community' : initial.source,
  );
  const [sort, setSort] = useState<GallerySort>(initial.sort);
  const [roomSort, setRoomSort] = useState<RoomGallerySortParam>(initial.roomSort);
  const [category, setCategory] = useState<string | null>(initial.category);
  const [query, setQuery] = useState(initial.query);

  const syncUrl = useCallback(
    (next: {
      mode: GalleryBrowseMode;
      source: GallerySource;
      sort: GallerySort;
      roomSort: RoomGallerySortParam;
      category: string | null;
      query: string;
    }) => {
      // Don't fight navigations away from the gallery (e.g. opening a public room).
      if (!isGalleryPathname()) return;
      const qs = buildGallerySearchParams(next);
      const path = `/gallery${qs}`;
      if (`${window.location.pathname}${window.location.search}` !== path) {
        navigate(path, true);
      }
    },
    [],
  );

  useEffect(() => {
    syncUrl({ mode, source, sort, roomSort, category, query });
  }, [mode, source, sort, roomSort, category, query, syncUrl]);

  useEffect(() => {
    const onPop = () => {
      if (!isGalleryPathname()) return;
      const next = parseGallerySearchParams(window.location.search);
      setMode(next.mode);
      setSource(next.source === 'mine' && !user ? 'community' : next.source);
      setSort(next.sort);
      setRoomSort(next.roomSort);
      setCategory(next.category);
      setQuery(next.query);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [user]);

  function handlePlace(model: GalleryModel) {
    onUseInRoom(model);
    if (!loggedIn) {
      onRequestAuth('signin');
    }
  }

  return (
    <div className="gallery-page tv-scroll">
      <header className="gallery-page-topbar">
        <button type="button" className="shared-brand" onClick={onGoHome}>
          <span
            className="tv-logo-mark"
            style={{ width: 25, height: 25, borderRadius: 7, fontSize: 17 }}
          >
            t
          </span>
          <span className="tv-logo-text" style={{ fontSize: 20 }}>
            Toova
          </span>
        </button>
        <h1 className="gallery-page-title">Gallery</h1>
      </header>

      <div className="gallery-page-main">
        <div className="gallery-mode-tabs" role="tablist" aria-label="Gallery sections">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              className={`gallery-mode-tab${mode === m.id ? ' is-active' : ''}`}
              onClick={() => {
                setMode(m.id);
                setQuery('');
                if (m.id === 'models' && source === 'mine') setSort('newest');
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'discover' ? (
          <GalleryHome
            currentUserId={user?.id ?? null}
            placeLabel="Use in a room"
            onPlace={handlePlace}
            onRequestAuth={() => onRequestAuth('signin')}
          />
        ) : null}

        {mode === 'rooms' ? (
          <RoomGallery
            sort={roomSort}
            query={query}
            onSortChange={setRoomSort}
            onQueryChange={setQuery}
          />
        ) : null}

        {mode === 'models' ? (
          <ModelGallery
            source={source}
            sort={sort}
            category={category}
            query={query}
            showMine={!!user}
            currentUserId={user?.id ?? null}
            placeLabel="Use in a room"
            onSourceChange={(s) => {
              if (s === 'mine' && !user) {
                onRequestAuth('signin');
                return;
              }
              setSource(s);
              if (s === 'mine') setSort('newest');
              else if (sort === 'newest') setSort('hot');
            }}
            onSortChange={setSort}
            onCategoryChange={setCategory}
            onQueryChange={setQuery}
            onPlace={handlePlace}
          />
        ) : null}
      </div>
    </div>
  );
}
