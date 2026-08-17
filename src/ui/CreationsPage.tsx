import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { GalleryModel } from '../hooks/useGalleryCatalog';
import type { GallerySort } from '../lib/galleryCatalog';
import type { Profile } from '../lib/profiles';
import { navigate, profilePath } from '../hooks/useRoute';
import { profileInitials } from '../lib/userDisplay';
import {
  AppShell,
  type AppShellNavId,
  Button,
  Input,
  SectionOpener,
} from './kit';
import { GalleryCategoryMenu, GallerySortMenu } from './GalleryFilters';
import { ImportModelModal } from './ImportModelModal';
import { ModelGallery } from './ModelGallery';

interface CreationsPageProps {
  user: User;
  profile: Profile | null;
  showAdmin?: boolean;
  onNavigate: (nav: AppShellNavId) => void;
  onLogout: () => void;
  onUseInRoom: (model: GalleryModel) => void;
  onContact?: () => void;
  onPitchMadness?: () => void;
}

export function CreationsPage({
  user,
  profile,
  showAdmin,
  onNavigate,
  onLogout,
  onUseInRoom,
  onContact,
  onPitchMadness,
}: CreationsPageProps) {
  const [sort, setSort] = useState<GallerySort>('newest');
  const [categories, setCategories] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importTab, setImportTab] = useState<'upload' | 'generate' | 'poster'>('generate');
  const [refreshKey, setRefreshKey] = useState(0);

  function openImport(tab: 'upload' | 'generate' | 'poster' = 'generate') {
    setImportTab(tab);
    setImportOpen(true);
  }

  return (
    <AppShell
      active="models"
      title="Models"
      meta="Your models"
      showAdmin={showAdmin}
      profileInitials={profileInitials(profile, user.email)}
      onNavigate={onNavigate}
      onLogout={onLogout}
      onContact={onContact}
      onPitchMadness={onPitchMadness}
      feedbackEmail={user.email ?? ''}
      feedbackUserId={user.id}
      onProfile={
        profile?.handle ? () => navigate(profilePath(profile.handle)) : undefined
      }
      actions={
        <Button
          size="sm"
          onClick={() => openImport('generate')}
        >
          New model
        </Button>
      }
    >
      <SectionOpener
        level={5}
        title="Your models."
        note="Upload, generate, and manage models you can place in any room."
      />

      <div className="gallery-page-header" style={{ marginTop: 28 }}>
        <div style={{ flex: 1 }} />
        <div className="gallery-filters-bar">
          <Input
            placeholder="Search your models"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: 220 }}
          />
          <GallerySortMenu
            entity="models"
            sort={sort}
            source="mine"
            onSortChange={(s) => setSort(s as GallerySort)}
          />
          <GalleryCategoryMenu
            categories={categories}
            onCategoriesChange={setCategories}
          />
        </div>
      </div>

      <ModelGallery
        key={refreshKey}
        source="mine"
        sort={sort}
        categories={categories}
        query={query}
        hideSourceTabs
        hideSortAndCategory
        currentUserId={user.id}
        placeLabel="Use in a room"
        onSourceChange={() => {
          /* locked to mine */
        }}
        onSortChange={setSort}
        onCategoriesChange={setCategories}
        onQueryChange={setQuery}
        onPlace={onUseInRoom}
      />

      <ImportModelModal
        userId={user.id}
        open={importOpen}
        initialTab={importTab}
        isAdmin={showAdmin}
        onClose={() => setImportOpen(false)}
        onAdded={() => {
          setRefreshKey((k) => k + 1);
          setImportOpen(false);
        }}
      />
    </AppShell>
  );
}
