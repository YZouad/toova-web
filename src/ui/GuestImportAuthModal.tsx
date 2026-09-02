import { useEffect } from 'react';
import { GlassSurface } from './GlassSurface';
import { Button } from './kit/Button';
import { MonoMeta } from './kit/MonoMeta';

export interface GuestImportAuthModalProps {
  open: boolean;
  onClose: () => void;
  onSignUp: () => void;
  onSignIn: () => void;
}

/** Prompt guests to create an account before uploading or generating models. */
export function GuestImportAuthModal({
  open,
  onClose,
  onSignUp,
  onSignIn,
}: GuestImportAuthModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="guest-import-auth-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="presentation"
      >
        <GlassSurface
          className="guest-import-auth-dialog"
          role="dialog"
          aria-labelledby="guest-import-auth-title"
          style={{ maxWidth: 400, width: '100%' }}
        >
          <div className="guest-import-auth-inner">
            <MonoMeta size="xs" tone="dense" upper className="guest-import-auth-eyebrow">
              Free account
            </MonoMeta>
            <h2 id="guest-import-auth-title" className="guest-import-auth-title">
              Sign up to bring in your own pieces
            </h2>
            <p className="guest-import-auth-hint">
              Upload a photo, a .glb file, or a poster — free accounts get five saved rooms.
            </p>
            <div className="guest-import-auth-actions">
              <Button size="sm" onClick={onSignUp}>
                Create free account
              </Button>
              <Button size="sm" variant="outline" onClick={onSignIn}>
                Log in
              </Button>
              <button type="button" className="guest-import-auth-dismiss" onClick={onClose}>
                Not now
              </button>
            </div>
          </div>
        </GlassSurface>
      </div>
    </div>
  );
}
