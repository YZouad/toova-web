import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { trackLimitReached } from '../../lib/analytics';
import { navigate } from '../../hooks/useRoute';
import { Button } from './Button';

type LimitType = 'ai_generations' | 'render_quality' | 'rooms' | 'ar_export' | 'share_links';

const ANALYTICS_LIMIT: Record<LimitType, 'ai_generations' | 'render_quality'> = {
  ai_generations: 'ai_generations',
  render_quality: 'render_quality',
  rooms: 'ai_generations',
  ar_export: 'render_quality',
  share_links: 'ai_generations',
};

export function Gate({
  allowed,
  limitType,
  title = 'Upgrade to unlock',
  message,
  children,
  fallback,
}: {
  allowed: boolean;
  limitType: LimitType;
  title?: string;
  message?: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const tracked = useRef(false);

  useEffect(() => {
    if (allowed || tracked.current) return;
    tracked.current = true;
    trackLimitReached({ limit_type: ANALYTICS_LIMIT[limitType] });
  }, [allowed, limitType]);

  if (allowed) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  return (
    <div className="gate-upgrade" role="status">
      <p className="gate-upgrade__title">{title}</p>
      {message ? <p className="gate-upgrade__message">{message}</p> : null}
      <Button type="button" variant="primary" onClick={() => navigate('/pricing')}>
        View plans
      </Button>
    </div>
  );
}
