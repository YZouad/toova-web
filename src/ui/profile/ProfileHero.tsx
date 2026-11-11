import type { Profile } from '../../lib/profiles';
import { CountUp } from '../bits';
import { Badge, Button, DisplayHeading, MonoMeta, Plate } from '../kit';
import { UserAvatar } from '../UserAvatar';

export interface ProfileHeroProps {
  profile: Profile;
  avatarUrl: string | null;
  isOwner: boolean;
  roomCount: number;
  modelCount: number;
  totalLikes: number;
  totalViews: number;
  onEditProfile: () => void;
  onReport?: () => void;
}

export function ProfileHero({
  profile,
  avatarUrl,
  isOwner,
  roomCount,
  modelCount,
  totalLikes,
  totalViews,
  onEditProfile,
  onReport,
}: ProfileHeroProps) {
  return (
    <div className="profile-hero">
      <Plate height={140} src={avatarUrl ?? undefined} className="profile-hero__avatar">
        {!avatarUrl ? (
          <div className="profile-edit-avatar-fallback">
            <UserAvatar name={profile.display_name} src={null} size={64} />
          </div>
        ) : null}
      </Plate>

      <div className="profile-hero__body">
        <div className="profile-hero__title-row">
          <div>
            <DisplayHeading level={4}>{profile.display_name}</DisplayHeading>
            <MonoMeta size="md" tone="dense" className="profile-hero__handle">
              @{profile.handle}
            </MonoMeta>
          </div>
          <div className="profile-hero__actions">
            {isOwner ? (
              <Button size="sm" variant="outline" onClick={onEditProfile}>
                Edit profile
              </Button>
            ) : onReport ? (
              <Button size="sm" variant="outline" onClick={onReport}>
                Report profile
              </Button>
            ) : null}
          </div>
        </div>

        {profile.bio ? <p className="profile-hero-bio">{profile.bio}</p> : null}

        <div className="profile-hero__stats">
          <div className="profile-hero__stat">
            <span className="profile-hero__stat-value">
              <CountUp value={roomCount} />
            </span>
            <MonoMeta size="xs" tone="subtle" upper>
              Rooms
            </MonoMeta>
          </div>
          <div className="profile-hero__stat">
            <span className="profile-hero__stat-value">
              <CountUp value={modelCount} />
            </span>
            <MonoMeta size="xs" tone="subtle" upper>
              Models
            </MonoMeta>
          </div>
          <div className="profile-hero__stat">
            <span className="profile-hero__stat-value">
              <CountUp value={totalLikes} />
            </span>
            <MonoMeta size="xs" tone="subtle" upper>
              Likes
            </MonoMeta>
          </div>
          <div className="profile-hero__stat">
            <span className="profile-hero__stat-value">
              <CountUp value={totalViews} />
            </span>
            <MonoMeta size="xs" tone="subtle" upper>
              Views
            </MonoMeta>
          </div>
          <Badge tone={profile.is_public ? 'accent' : 'neutral'} dot={profile.is_public}>
            {profile.is_public ? 'Public' : 'Private'}
          </Badge>
        </div>
      </div>
    </div>
  );
}
