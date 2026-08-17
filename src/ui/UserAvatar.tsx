interface UserAvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) || '?').toUpperCase();
}

export function UserAvatar({ name, src, size = 36, className }: UserAvatarProps) {
  const style = {
    width: size,
    height: size,
    borderRadius: 'var(--radius-sm)',
    fontSize: Math.max(10, Math.round(size * 0.36)),
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.04em',
  } as const;

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={className ? `user-avatar ${className}` : 'user-avatar'}
        style={{ ...style, objectFit: 'cover', display: 'block', background: 'var(--accent-bg)' }}
      />
    );
  }

  return (
    <div
      className={className ? `user-avatar user-avatar--initials ${className}` : 'user-avatar user-avatar--initials'}
      style={{
        ...style,
        background: 'var(--ink-1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--cream-1)',
        fontWeight: 400,
        flexShrink: 0,
      }}
      aria-hidden
    >
      {initialsFromName(name)}
    </div>
  );
}
