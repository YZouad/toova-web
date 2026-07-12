interface IntroBackButtonProps {
  onBack?: () => void;
}

export function IntroBackButton({ onBack }: IntroBackButtonProps) {
  if (!onBack) return null;

  return (
    <button type="button" className="onboarding-back-btn" onClick={onBack} aria-label="Go back">
      ← Back
    </button>
  );
}
