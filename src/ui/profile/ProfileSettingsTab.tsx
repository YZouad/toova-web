import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { Profile } from '../../lib/profiles';
import { AccountPrivacySettings } from '../AccountPrivacySettings';
import { NotificationPreferences } from '../NotificationPreferences';
import { MonoMeta, SectionOpener } from '../kit';
import { ProfileEditPanel } from './ProfileEditPanel';
import { writeProfileQuery, type SettingsSectionId } from './profileHelpers';
import { ThrixelIntegrationPanel } from './ThrixelIntegrationPanel';

const SECTIONS: Array<{ id: SettingsSectionId; label: string; note: string }> = [
  { id: 'profile', label: 'Profile', note: 'Public identity' },
  { id: 'notifications', label: 'Notifications', note: 'Inbox preferences' },
  { id: 'integrations', label: 'Integrations', note: 'Third-party tools' },
  { id: 'privacy', label: 'Privacy & account', note: 'Your data' },
];

export interface ProfileSettingsTabProps {
  profile: Profile;
  avatarUrl: string | null;
  viewerUserId: string;
  busy: boolean;
  formError: string | null;
  editHandle: string;
  editName: string;
  editBio: string;
  editPublic: boolean;
  initialSection?: SettingsSectionId;
  onEditHandle: (v: string) => void;
  onEditName: (v: string) => void;
  onEditBio: (v: string) => void;
  onEditPublic: (v: boolean) => void;
  onSave: (e: FormEvent) => void;
  onAvatarChange: (file: File | null) => void;
  onClearAvatar: () => void;
}

export function ProfileSettingsTab({
  profile,
  avatarUrl,
  viewerUserId,
  busy,
  formError,
  editHandle,
  editName,
  editBio,
  editPublic,
  initialSection = 'profile',
  onEditHandle,
  onEditName,
  onEditBio,
  onEditPublic,
  onSave,
  onAvatarChange,
  onClearAvatar,
}: ProfileSettingsTabProps) {
  const [active, setActive] = useState<SettingsSectionId>(initialSection);
  const panelRefs = useRef<Partial<Record<SettingsSectionId, HTMLElement | null>>>({});
  const scrollingRef = useRef(false);

  useEffect(() => {
    setActive(initialSection);
  }, [initialSection]);

  useEffect(() => {
    if (initialSection === 'profile') return;
    const el = panelRefs.current[initialSection];
    if (!el) return;
    scrollingRef.current = true;
    // Defer until layout settles after tab animation.
    const t = window.setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => {
        scrollingRef.current = false;
      }, 600);
    }, 80);
    return () => window.clearTimeout(t);
  }, [initialSection]);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    const ratios = new Map<SettingsSectionId, number>();

    for (const section of SECTIONS) {
      const el = panelRefs.current[section.id];
      if (!el) continue;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (!entry) return;
          ratios.set(section.id, entry.intersectionRatio);
          if (scrollingRef.current) return;
          let best: SettingsSectionId = 'profile';
          let bestRatio = 0;
          for (const [id, ratio] of ratios) {
            if (ratio > bestRatio) {
              bestRatio = ratio;
              best = id;
            }
          }
          if (bestRatio > 0.15) {
            setActive((prev) => {
              if (prev === best) return prev;
              writeProfileQuery('settings', best);
              return best;
            });
          }
        },
        { rootMargin: '-20% 0px -55% 0px', threshold: [0, 0.15, 0.35, 0.55, 0.75] },
      );
      obs.observe(el);
      observers.push(obs);
    }

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  function scrollToSection(id: SettingsSectionId) {
    const el = panelRefs.current[id];
    if (!el) return;
    scrollingRef.current = true;
    setActive(id);
    writeProfileQuery('settings', id);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      scrollingRef.current = false;
    }, 600);
  }

  return (
    <div className="profile-settings" aria-labelledby="tab-settings">
      <nav className="profile-settings__nav" aria-label="Settings sections">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            className={[
              'profile-settings__nav-item',
              active === section.id ? 'profile-settings__nav-item--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => scrollToSection(section.id)}
          >
            <span className="profile-settings__nav-label">{section.label}</span>
            <MonoMeta size="xs" tone="subtle" className="profile-settings__nav-note">
              {section.note}
            </MonoMeta>
          </button>
        ))}
      </nav>

      <div className="profile-settings__panels">
        <SettingsPanel
          id="profile"
          title="Profile."
          note="Public identity"
          panelRef={(node) => {
            panelRefs.current.profile = node;
          }}
        >
          <ProfileEditPanel
            profile={profile}
            avatarUrl={avatarUrl}
            busy={busy}
            formError={formError}
            editHandle={editHandle}
            editName={editName}
            editBio={editBio}
            editPublic={editPublic}
            onEditHandle={onEditHandle}
            onEditName={onEditName}
            onEditBio={onEditBio}
            onEditPublic={onEditPublic}
            onSave={onSave}
            onAvatarChange={onAvatarChange}
            onClearAvatar={onClearAvatar}
          />
        </SettingsPanel>

        <SettingsPanel
          id="notifications"
          title="Email notifications."
          note="Inbox preferences"
          panelRef={(node) => {
            panelRefs.current.notifications = node;
          }}
        >
          <NotificationPreferences userId={viewerUserId} />
        </SettingsPanel>

        <SettingsPanel
          id="integrations"
          title="Integrations."
          note="Third-party tools"
          panelRef={(node) => {
            panelRefs.current.integrations = node;
          }}
        >
          <ThrixelIntegrationPanel enabled />
        </SettingsPanel>

        <SettingsPanel
          id="privacy"
          title="Privacy & account."
          note="Your data"
          panelRef={(node) => {
            panelRefs.current.privacy = node;
          }}
        >
          <AccountPrivacySettings />
        </SettingsPanel>
      </div>
    </div>
  );
}

function SettingsPanel({
  id,
  title,
  note,
  children,
  panelRef,
}: {
  id: SettingsSectionId;
  title: string;
  note: string;
  children: ReactNode;
  panelRef: (node: HTMLElement | null) => void;
}) {
  return (
    <section
      id={`settings-${id}`}
      ref={panelRef}
      className="profile-panel"
    >
      <SectionOpener level={5} title={title} note={note} />
      <div className="profile-panel__body">{children}</div>
    </section>
  );
}
