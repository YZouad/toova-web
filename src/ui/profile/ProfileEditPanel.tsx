import type { FormEvent } from 'react';
import type { Profile } from '../../lib/profiles';
import {
  Banner,
  Button,
  Checkbox,
  Field,
  Input,
  MonoMeta,
  Plate,
} from '../kit';
import { UserAvatar } from '../UserAvatar';

export interface ProfileEditPanelProps {
  profile: Profile;
  avatarUrl: string | null;
  busy: boolean;
  formError: string | null;
  editHandle: string;
  editName: string;
  editBio: string;
  editPublic: boolean;
  onEditHandle: (v: string) => void;
  onEditName: (v: string) => void;
  onEditBio: (v: string) => void;
  onEditPublic: (v: boolean) => void;
  onSave: (e: FormEvent) => void;
  onAvatarChange: (file: File | null) => void;
  onClearAvatar: () => void;
}

export function ProfileEditPanel({
  profile,
  avatarUrl,
  busy,
  formError,
  editHandle,
  editName,
  editBio,
  editPublic,
  onEditHandle,
  onEditName,
  onEditBio,
  onEditPublic,
  onSave,
  onAvatarChange,
  onClearAvatar,
}: ProfileEditPanelProps) {
  return (
    <form className="profile-edit-form profile-edit-form--panel" onSubmit={onSave}>
      {formError ? <Banner tone="error">{formError}</Banner> : null}

      <div className="profile-edit-grid">
        <div className="profile-edit-avatar">
          <Field label="Avatar">
            <label
              className={[
                'profile-edit-avatar-hit',
                busy ? 'profile-edit-avatar-hit--busy' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <Plate height={200} src={avatarUrl ?? undefined}>
                {!avatarUrl ? (
                  <div className="profile-edit-avatar-fallback">
                    <UserAvatar name={editName || profile.display_name} src={null} size={72} />
                  </div>
                ) : null}
                <span className="profile-edit-avatar-overlay" aria-hidden>
                  <svg
                    className="profile-edit-avatar-icon"
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="square"
                    strokeLinejoin="miter"
                  >
                    <path d="M12 16V5" />
                    <path d="M8 9l4-4 4 4" />
                    <path d="M4 16v3h16v-3" />
                  </svg>
                  <span className="profile-edit-avatar-overlay-label">Upload here</span>
                </span>
              </Plate>
              <input
                type="file"
                accept="image/*"
                hidden
                disabled={busy}
                onChange={(e) => onAvatarChange(e.target.files?.[0] ?? null)}
              />
            </label>
            {profile.avatar_path ? (
              <div className="profile-edit-avatar-actions">
                <Button size="sm" variant="outline" disabled={busy} onClick={onClearAvatar}>
                  Remove
                </Button>
              </div>
            ) : null}
          </Field>
        </div>

        <div className="profile-edit-fields">
          <div className="profile-edit-row">
            <Field label="Handle" htmlFor="profile-handle">
              <Input
                id="profile-handle"
                value={editHandle}
                onChange={(e) => onEditHandle(e.target.value.toLowerCase())}
                maxLength={30}
                disabled={busy}
              />
            </Field>
            <Field label="Display name" htmlFor="profile-name">
              <Input
                id="profile-name"
                value={editName}
                onChange={(e) => onEditName(e.target.value)}
                maxLength={60}
                disabled={busy}
              />
            </Field>
          </div>

          <Field label="Bio" htmlFor="profile-bio">
            <textarea
              id="profile-bio"
              className="kit-input"
              value={editBio}
              onChange={(e) => onEditBio(e.target.value)}
              maxLength={280}
              rows={4}
              disabled={busy}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </Field>

          <div className="profile-edit-footer">
            <div className="profile-edit-visibility">
              <Checkbox
                checked={editPublic}
                onChange={onEditPublic}
                disabled={busy}
                label="Make profile public"
              />
              <MonoMeta size="xs" tone="subtle">
                Public profiles can list rooms you publish. Private rooms stay hidden.
              </MonoMeta>
            </div>
            <Button type="submit" size="md" disabled={busy}>
              Save profile
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
