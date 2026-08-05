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
import { navigate, profilePath } from '../hooks/useRoute';
import { profileInitials } from '../lib/userDisplay';
import {
  AppShell,
  type AppShellNavId,
  Button,
  Input,
  Tabs,
} from './kit';
import { GalleryHome } from './GalleryHome';
import { GalleryCategoryMenu, GallerySortMenu } from './GalleryFilters';
import { ModelGallery } from './ModelGallery';
import { RoomGallery } from './RoomGallery';

interface GalleryPageProps {
  loggedIn: boolean;
  showAdmin?: boolean;
  onGoHome: () => void;
  onRequestAuth: (mode: 'signin' | 'signup') => void;
  onUseInRoom: (model: GalleryModel) => void;
  onNavigate: (nav: AppShellNavId) => void;
  onLogout?: () => void;
}

/** Kit-aligned primary tabs: Rooms | Models. Discover URL maps to Rooms shelves. */
type ShellTab = 'rooms' | 'models';

const GALLERY_PATH_RE = /^\/gallery\/?$/i;

function isGalleryPathname(pathname = window.location.pathname): boolean {
  return GALLERY_PATH_RE.test(pathname.replace(/\/+$/, '') || '/');
}

function modeToTab(mode: GalleryBrowseMode): ShellTab {
  return mode === 'models' ? 'models' : 'rooms';
}

export function GalleryPage({
  loggedIn,
  showAdmin,
  onRequestAuth,
  onUseInRoom,
  onNavigate,
  onLogout,
}: GalleryPageProps) {
  const { user, profile } = useAuth();
  const initial = parseGallerySearchParams(window.location.search);
  const [mode, setMode] = useState<GalleryBrowseMode>(initial.mode);
  const [source, setSource] = useState<GallerySource>(
    initial.source === 'mine' && !user ? 'community' : initial.source,
  );
  const [sort, setSort] = useState<GallerySort>(initial.sort);
  const [roomSort, setRoomSort] = useState<RoomGallerySortParam>(initial.roomSort);
  const [category, setCategory] = useState<string | null>(initial.category);
  const [query, setQuery] = useState(initial.query);
  const [browse, setBrowse] = useState(
    () =>
      Boolean(initial.query.trim()) ||
      initial.mode === 'rooms' ||
      initial.mode === 'models',
  );

  const tab = modeToTab(mode);

  const syncUrl = useCallback(
    (next: {
      mode: GalleryBrowseMode;
      source: GallerySource;
      sort: GallerySort;
      roomSort: RoomGallerySortParam;
      category: string | null;
      query: string;
    }) => {
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
      setBrowse(
        Boolean(next.query.trim()) ||
          next.mode === 'rooms' ||
          next.mode === 'models',
      );
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

  function setShellTab(next: ShellTab) {
    setQuery('');
    setCategory(null);
    setBrowse(false);
    if (next === 'rooms') {
      setMode('discover');
      setRoomSort('hot');
    } else {
      setMode('models');
      setSource(user ? source : 'community');
      if (source === 'mine' && sort === 'hot') setSort('newest');
      else if (source !== 'mine' && sort === 'newest') setSort('hot');
    }
  }

  function openBrowse(next: ShellTab) {
    setBrowse(true);
    if (next === 'rooms') {
      setMode('rooms');
    } else {
      setMode('models');
    }
  }

  const showRoomShelves = tab === 'rooms' && !browse;
  const showModelShelves = tab === 'models' && !browse && !query.trim() && !category;

  return (
    <AppShell
      active="gallery"
      title="Gallery"
      meta="Discover rooms & models"
      showAdmin={showAdmin}
      profileInitials={profileInitials(profile, user?.email)}
      onNavigate={onNavigate}
      onLogout={onLogout}
      onProfile={
        profile?.handle ? () => navigate(profilePath(profile.handle)) : undefined
      }
      actions={
        <>
          <Button
            variant="mono"
            onClick={() => {
              if (!loggedIn) {
                onRequestAuth('signin');
                return;
              }
              onNavigate('rooms');
            }}
          >
            Submit a room →
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setShellTab('models');
              openBrowse('models');
            }}
          >
            Use in a room
          </Button>
        </>
      }
    >
      <div className="gallery-page-header">
        <Tabs
          active={tab}
          onChange={(id) => setShellTab(id as ShellTab)}
          style={{ flex: 1 }}
          tabs={[
            { id: 'rooms', label: 'Rooms' },
            { id: 'models', label: 'Models' },
          ]}
        />
        <div className="gallery-filters-bar">
          <Input
            placeholder={tab === 'rooms' ? 'Search rooms' : 'Search models'}
            value={query}
            onChange={(e) => {
              const q = e.target.value;
              setQuery(q);
              if (q.trim()) openBrowse(tab);
            }}
            style={{ width: 220 }}
          />
          {tab === 'rooms' ? (
            <GallerySortMenu
              entity="rooms"
              sort={roomSort}
              onSortChange={(s) => {
                setRoomSort(s as RoomGallerySortParam);
                openBrowse('rooms');
              }}
            />
          ) : (
            <>
              <GallerySortMenu
                entity="models"
                sort={sort}
                source={source}
                onSortChange={(s) => {
                  setSort(s as GallerySort);
                  openBrowse('models');
                }}
              />
              <GalleryCategoryMenu
                category={category}
                onCategoryChange={(c) => {
                  setCategory(c);
                  openBrowse('models');
                }}
              />
            </>
          )}
        </div>
      </div>

      {showRoomShelves ? (
        <GalleryHome
          scope="rooms"
          currentUserId={user?.id ?? null}
          placeLabel="Use in a room"
          onPlace={handlePlace}
          onRequestAuth={() => onRequestAuth('signin')}
          onSeeAllRooms={() => openBrowse('rooms')}
        />
      ) : null}

      {showModelShelves ? (
        <GalleryHome
          scope="models"
          currentUserId={user?.id ?? null}
          placeLabel="Use in a room"
          onPlace={handlePlace}
          onRequestAuth={() => onRequestAuth('signin')}
          onSeeAllModels={() => openBrowse('models')}
        />
      ) : null}

      {tab === 'rooms' && browse ? (
        <RoomGallery
          sort={roomSort}
          query={query}
          onSortChange={setRoomSort}
          onQueryChange={setQuery}
          hideFilters
        />
      ) : null}

      {tab === 'models' && (browse || query.trim() || category) ? (
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
            if (s === 'mine' && sort === 'hot') setSort('newest');
            else if (s !== 'mine' && sort === 'newest') setSort('hot');
            openBrowse('models');
          }}
          onSortChange={(s) => {
            setSort(s);
            openBrowse('models');
          }}
          onCategoryChange={(c) => {
            setCategory(c);
            openBrowse('models');
          }}
          onQueryChange={(q) => {
            setQuery(q);
            if (q.trim()) openBrowse('models');
          }}
          onPlace={handlePlace}
        />
      ) : null}
    </AppShell>
  );
}
