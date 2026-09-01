/** Inline SVG icons for the designer left rail — match Designer Redesign.dc.html. */

export function IconPlus({ stroke = 'currentColor' }: { stroke?: string }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function IconRoomLook() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
      <path d="M10 5v14" />
    </svg>
  );
}

export function IconLight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </svg>
  );
}

export function IconPieces() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  );
}

export function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.6-3.6" />
    </svg>
  );
}

export function IconUpload({ stroke = 'currentColor' }: { stroke?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 16V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

export function IconPlay() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 5.5l10 6.5-10 6.5z" />
    </svg>
  );
}

export function IconBack() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function IconEye() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconReset() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

export function IconDuplicate() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 5H6a2 2 0 0 0-2 2v9" />
    </svg>
  );
}

export function IconTrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 7h14M9 7V5h6v2M6.5 7l.9 12.1h9.2L17.5 7" />
    </svg>
  );
}

export function IconHangingLights({ size = 14, stroke = 'currentColor' }: { size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6h16" />
      <path d="M7 6v2.5" />
      <circle cx="7" cy="11" r="2" fill={stroke} stroke="none" />
      <path d="M12 6v3.5" />
      <circle cx="12" cy="12.5" r="2" fill={stroke} stroke="none" />
      <path d="M17 6v2.5" />
      <circle cx="17" cy="11" r="2" fill={stroke} stroke="none" />
    </svg>
  );
}

export function IconHangingLeaves({ size = 14, stroke = 'currentColor' }: { size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6h16" />
      <path d="M7 6v2" />
      <path d="M7 8c-2.2 1.2-2.5 3.8-1 5.5 1.8-0.8 2.2-3.2 1-5.5" fill={stroke} stroke="none" />
      <path d="M12 6v2.5" />
      <path d="M12 8.5c-2.5 1.5-2.8 4.5-1.2 6.5 2-1 2.5-4 1.2-6.5" fill={stroke} stroke="none" />
      <path d="M17 6v1.5" />
      <path d="M17 7.5c2.2 1.2 2.5 3.8 1 5.5-1.8-0.8-2.2-3.2-1-5.5" fill={stroke} stroke="none" />
    </svg>
  );
}

export function IconLedStrip({ size = 14, stroke = 'currentColor' }: { size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12h16" strokeWidth="2.5" />
      <rect x="6" y="10.5" width="2.5" height="3" rx="0.5" fill={stroke} stroke="none" />
      <rect x="10.75" y="10.5" width="2.5" height="3" rx="0.5" fill={stroke} stroke="none" />
      <rect x="15.5" y="10.5" width="2.5" height="3" rx="0.5" fill={stroke} stroke="none" />
      <circle cx="4" cy="12" r="1.25" fill={stroke} stroke="none" />
      <circle cx="20" cy="12" r="1.25" fill={stroke} stroke="none" />
    </svg>
  );
}

export function IconFreeLight({ size = 14, stroke = 'currentColor' }: { size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="11" r="4.25" />
      <path d="M9.5 15.2h5" />
      <path d="M10.2 17h3.6" />
      <path d="M12 4.5v1.5M8.2 6.2l1 1M15.8 6.2l-1 1" strokeWidth="1.4" />
    </svg>
  );
}
