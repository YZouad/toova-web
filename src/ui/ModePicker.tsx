import { IntroBackButton } from './IntroBackButton';

export type AppMode = 'ar' | '3d';

interface ModePickerProps {
  onSelectMode: (mode: AppMode) => void;
  onBack?: () => void;
}

export function ModePicker({ onSelectMode, onBack }: ModePickerProps) {
  return (
    <div className="onboarding-page mode-picker-page">
      <IntroBackButton onBack={onBack} />
      <header className="onboarding-header">
        <img src={`${import.meta.env.BASE_URL}toova-logo-cropped.png`} alt="Toova" className="onboarding-logo-img" />
      </header>
      <main className="onboarding-main onboarding-main--wide">
        <div className="onboarding-mode-heading">
          <h1 className="onboarding-title">How do you want to design?</h1>
          <p className="onboarding-subtitle">Choose your experience.</p>
        </div>
        <div className="onboarding-choice-grid">
          <button
            type="button"
            className="onboarding-choice-card"
            onClick={() => onSelectMode('ar')}
          >
            <span className="onboarding-choice-icon" aria-hidden={true}>
              📷
            </span>
            <span className="onboarding-choice-title">
              AR — Place models in your real space (iPhone)
            </span>
            <span className="onboarding-choice-body">
              Point your iPhone camera at any room to place furniture in real space.
            </span>
          </button>
          <button
            type="button"
            className="onboarding-choice-card"
            onClick={() => onSelectMode('3d')}
          >
            <span className="onboarding-choice-icon" aria-hidden={true}>
              🖥
            </span>
            <span className="onboarding-choice-title">
              3D Design — Build and arrange a virtual room
            </span>
            <span className="onboarding-choice-body">
              Design and furnish a virtual room from your browser — no app needed.
            </span>
          </button>
        </div>
      </main>
    </div>
  );
}
