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
import { FeedbackModal } from './FeedbackModal';
import {
  AppShell,
  type AppShellNavId,
  Button,
  Input,
  MarketingNav,
  MarketingNavAuthActions,
  SiteFooter,
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
  onContact?: () => void;
  onPitchMadness?: () => void;
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
  onGoHome,
  onRequestAuth,
  onUseInRoom,
  onNavigate,
  onLogout,
  onContact,
  onPitchMadness,
}: GalleryPageProps) {
  const { user, profile } = useAuth();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const initial = parseGallerySearchParams(window.location.search);
  const [mode, setMode] = useState<GalleryBrowseMode>(initial.mode);
  const [source, setSource] = useState<GallerySource>(
    initial.source === 'mine' ? 'community' : initial.source,
  );
  const [sort, setSort] = useState<GallerySort>(initial.sort);
  const [roomSort, setRoomSort] = useState<RoomGallerySortParam>(initial.roomSort);
  const [categories, setCategories] = useState<string[]>(initial.categories);
  const [query, setQuery] = useState(initial.query);
  const [browse, setBrowse] = useState(
    () =>
      Boolean(initial.query.trim()) ||
      initial.mode === 'rooms' ||
      initial.mode === 'models' ||
      initial.categories.length > 0,
  );

  const tab = modeToTab(mode);

  const syncUrl = useCallback(
    (next: {
      mode: GalleryBrowseMode;
      source: GallerySource;
      sort: GallerySort;
      roomSort: RoomGallerySortParam;
      categories: string[];
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
    if (initial.source === 'mine' && loggedIn) {
      onNavigate('models');
    }
    // One-shot redirect for legacy ?source=mine gallery links.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  useEffect(() => {
    syncUrl({ mode, source, sort, roomSort, categories, query });
  }, [mode, source, sort, roomSort, categories, query, syncUrl]);

  useEffect(() => {
    const onPop = () => {
      if (!isGalleryPathname()) return;
      const next = parseGallerySearchParams(window.location.search);
      setMode(next.mode);
      setSource(next.source === 'mine' ? 'community' : next.source);
      setSort(next.sort);
      setRoomSort(next.roomSort);
      setCategories(next.categories);
      setQuery(next.query);
      setBrowse(
        Boolean(next.query.trim()) ||
          next.mode === 'rooms' ||
          next.mode === 'models' ||
          next.categories.length > 0,
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
    setCategories([]);
    setBrowse(false);
    if (next === 'rooms') {
      setMode('discover');
      setRoomSort('hot');
    } else {
      setMode('models');
      if (source !== 'community' && source !== 'toova') setSource('community');
      if (sort === 'newest') setSort('hot');
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
  const showModelShelves =
    tab === 'models' && !browse && !query.trim() && categories.length === 0;

  const actions = (
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
        className="gallery-action-use-in-room"
        onClick={() => {
          setShellTab('models');
          openBrowse('models');
        }}
      >
        Use in a room
      </Button>
    </>
  );

  const body = (
    <>
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
                categories={categories}
                onCategoriesChange={(c) => {
                  setCategories(c);
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

      {tab === 'models' && (browse || query.trim() || categories.length > 0) ? (
        <ModelGallery
          source={source === 'mine' ? 'community' : source}
          sort={sort}
          categories={categories}
          query={query}
          currentUserId={user?.id ?? null}
          placeLabel="Use in a room"
          onSourceChange={(s) => {
            if (s === 'mine') {
              if (!user) {
                onRequestAuth('signin');
                return;
              }
              onNavigate('models');
              return;
            }
            setSource(s);
            if (sort === 'newest') setSort('hot');
            openBrowse('models');
          }}
          onSortChange={(s) => {
            setSort(s);
            openBrowse('models');
          }}
          onCategoriesChange={(c) => {
            setCategories(c);
            openBrowse('models');
          }}
          onQueryChange={(q) => {
            setQuery(q);
            if (q.trim()) openBrowse('models');
          }}
          onPlace={handlePlace}
        />
      ) : null}
    </>
  );

  if (!loggedIn) {
    return (
      <div className="toova-page">
        <div className="toova-paper" aria-hidden />
        <FeedbackModal
          open={feedbackOpen}
          onClose={() => setFeedbackOpen(false)}
          pageSource="gallery"
        />
        <MarketingNav
          brandOnClick={onGoHome}
          links={[
            { label: 'Log in', onClick: () => onRequestAuth('signin') },
            { label: 'Home', onClick: onGoHome },
            { label: 'Gallery', active: true },
            { label: 'Contact', onClick: onContact },
          ]}
          cta={
            <MarketingNavAuthActions
              onLogin={() => onRequestAuth('signin')}
              onPrimary={() => onRequestAuth('signup')}
            />
          }
        />
        <div className="toova-frame gallery-public-page">
          <div className="gallery-public-page__head">
            <div className="gallery-public-page__head-title">
              <h1 className="kit-app-shell__title">Gallery</h1>
            </div>
            <div className="kit-app-shell__actions">{actions}</div>
          </div>
          {body}
        </div>
        <SiteFooter
          className="gallery-public-page__footer"
          onContact={onContact}
          onPitchMadness={onPitchMadness}
          onFeedback={() => setFeedbackOpen(true)}
        />
      </div>
    );
  }

  return (
    <AppShell
      active="gallery"
      title="Gallery"
      showAdmin={showAdmin}
      profileInitials={profileInitials(profile, user?.email)}
      onNavigate={onNavigate}
      onLogout={onLogout}
      onContact={onContact}
      onPitchMadness={onPitchMadness}
      feedbackEmail={user?.email ?? ''}
      feedbackUserId={user?.id}
      onProfile={
        profile?.handle ? () => navigate(profilePath(profile.handle)) : undefined
      }
      actions={actions}
    >
      {body}
    </AppShell>
  );
}
