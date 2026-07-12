import { useEffect } from 'react';

export const DEMO_VIDEO_URL = `${import.meta.env.BASE_URL}full-demo.mp4`;
export const TWO_D_THREE_D_DEMO_URL = `${import.meta.env.BASE_URL}2d-3d-demo.mp4`;
export const JUST_WEB_DEMO_URL = `${import.meta.env.BASE_URL}just-web-demo.mp4`;
export const MOBILE_DEMO_URL = `${import.meta.env.BASE_URL}mobile-demo.mp4`;

interface DemoVideoModalProps {
  open: boolean;
  onClose: () => void;
  src?: string;
}

export function DemoVideoModal({ open, onClose, src = DEMO_VIDEO_URL }: DemoVideoModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="demo-video-modal"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Demo video"
    >
      <div className="demo-video-modal-inner" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="demo-video-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <video
          className="demo-video-modal-player"
          src={src}
          controls
          autoPlay
          playsInline
        />
      </div>
    </div>
  );
}
