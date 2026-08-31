export interface MobilePresentBarProps {
  /** Current camera preset label (e.g. Room, Desk, Top). */
  viewLabel: string;
  onPrevView: () => void;
  onNextView: () => void;
  onEdit: () => void;
  /** When false, bar and hint are hidden (room tap toggles). */
  presentControlsVisible: boolean;
  onToggle: () => void;
}

/**
 * Phone present mode — prev / current / next camera + Edit.
 * Tap the room to hide or restore via presentControlsVisible + onToggle.
 */
export function MobilePresentBar({
  viewLabel,
  onPrevView,
  onNextView,
  onEdit,
  presentControlsVisible,
  onToggle,
}: MobilePresentBarProps) {
  return (
    <>
      <button
        type="button"
        className="dgm-present-tap"
        aria-label={presentControlsVisible ? 'Hide present controls' : 'Show present controls'}
        onClick={onToggle}
      />
      {presentControlsVisible ? (
        <>
          <p className="dgm-present-hint">presenting · tap to hide</p>
          <div className="dgm-present-bar" role="toolbar" aria-label="Present mode">
            <button type="button" className="dgm-present-bar__nav" aria-label="Previous view" onClick={onPrevView}>
              ◀
            </button>
            <span className="dgm-present-bar__label">{viewLabel}</span>
            <button type="button" className="dgm-present-bar__nav" aria-label="Next view" onClick={onNextView}>
              ▶
            </button>
            <button type="button" className="dgm-present-bar__edit" onClick={onEdit}>
              Edit
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}
