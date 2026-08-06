/** @deprecated unused by App routing — pending delete */
import { IntroBackButton } from './IntroBackButton';
import { Logo } from './kit';

interface IntroPageProps {
  onStart: () => void;
  roomLabel?: string;
  onSwitchRooms?: () => void;
  onBack?: () => void;
}

export function IntroPage({ onStart, roomLabel, onSwitchRooms, onBack }: IntroPageProps) {
  return (
    <div className="onboarding-page">
      <IntroBackButton onBack={onBack} />
      <header className="onboarding-header">
        <Logo size={28} />
      </header>
      <main className="onboarding-main">
        <div className="onboarding-card">
          <h1 className="onboarding-title">3DVisSim</h1>
          {roomLabel ? (
            <p className="onboarding-room-banner">
              Open room: <strong>{roomLabel}</strong>
              {onSwitchRooms ? (
                <>
                  {' '}
                  ·{' '}
                  <button type="button" className="onboarding-room-switch" onClick={onSwitchRooms}>
                    Choose another room
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
          <ul className="onboarding-feature-list">
            <li>Drag furniture across a true-scale 8'5" × 15' room</li>
            <li>Rotate with R (15°) or Shift+R (90°)</li>
            <li>Tuck-under physics — slide a dresser beneath a raised bed</li>
            <li>Adjustable bed leg height from 4" to 36"</li>
            <li>Import your own GLTF / GLB models</li>
            <li>Walls fade out so you always see inside</li>
          </ul>
          <button type="button" className="onboarding-btn onboarding-btn-primary" onClick={onStart}>
            Start Planning
          </button>
        </div>
      </main>
    </div>
  );
}
