import { navigate, galleryPath } from '../../hooks/useRoute';
import type { ProfileCatalogModel } from '../../lib/profiles';
import { SpotlightCard } from '../bits';
import { EmptyState, MonoMeta, Plate, SectionOpener } from '../kit';

export interface ProfileModelsTabProps {
  models: ProfileCatalogModel[];
  modelThumbs: Record<string, string>;
  isOwner: boolean;
}

export function ProfileModelsTab({ models, modelThumbs, isOwner }: ProfileModelsTabProps) {
  return (
    <section className="profile-models" aria-labelledby="tab-models">
      <SectionOpener
        level={5}
        title={isOwner ? 'Your models.' : 'Published models.'}
        note={`${models.length} model${models.length === 1 ? '' : 's'}`}
      />

      {models.length === 0 ? (
        <EmptyState
          style={{ marginTop: 32 }}
          label="No models"
          title={isOwner ? 'No models yet.' : 'No published models yet.'}
          body={isOwner ? 'Create one from the gallery or designer.' : undefined}
        />
      ) : (
        <div className="gallery-plate-grid gallery-plate-grid--models profile-models-grid">
          {models.map((m) => (
            <SpotlightCard
              key={m.kind}
              className="profile-model-card kit-plate-card kit-plate-card--interactive"
              onClick={() => navigate(galleryPath('?source=community'))}
              role="button"
              tabIndex={0}
            >
              <Plate
                src={modelThumbs[m.kind]}
                height={180}
                topCaption={`${m.kind.split('-')[0]}.glb`}
              />
              <div className="profile-model-card__caption">
                <div className="profile-model-card__name" title={m.label}>
                  {m.label}
                </div>
                <MonoMeta size="sm" tone="dense" className="profile-model-card__meta">
                  ♥ {m.likes_count} · ↓ {m.downloads_count} · 👁 {m.views_count}
                </MonoMeta>
              </div>
            </SpotlightCard>
          ))}
        </div>
      )}
    </section>
  );
}
