import { useEffect, useState } from 'react';
import {
  connectThrixel,
  disconnectThrixel,
  fetchThrixelConnectionStatus,
  type ThrixelConnectionStatus,
} from '../../lib/thrixelApi';
import { useThrixelCredits } from '../../hooks/useThrixelCredits';
import { formatRelativeTime } from '../../lib/userDisplay';
import { ThrixelCreditsBanner } from '../ThrixelCreditsBanner';
import { Badge, Banner, Button, Field, Input, MonoMeta } from '../kit';

export interface ThrixelIntegrationPanelProps {
  enabled: boolean;
}

export function ThrixelIntegrationPanel({ enabled }: ThrixelIntegrationPanelProps) {
  const [status, setStatus] = useState<ThrixelConnectionStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const credits = useThrixelCredits(enabled && status?.connected === true);

  useEffect(() => {
    if (!enabled) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    void fetchThrixelConnectionStatus()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {
        if (!cancelled) setStatus({ connected: false });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  async function handleConnect() {
    setError(null);
    const key = apiKey.trim();
    if (!key) {
      setError('Paste your Thrixel API key.');
      return;
    }
    setBusy(true);
    try {
      const next = await connectThrixel(key);
      setStatus(next);
      setApiKey('');
      void credits.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect Thrixel.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setError(null);
    setBusy(true);
    try {
      await disconnectThrixel();
      setStatus({ connected: false });
      setApiKey('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disconnect Thrixel.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profile-panel-body">
      <Field label="Thrixel">
        <MonoMeta size="sm" tone="subtle" className="profile-panel-hint">
          Connect your Thrixel account to generate 3D models from Toova using your own cubes.
          Create an API key at{' '}
          <a href="https://thrixel.com/create/#settings/api-keys" target="_blank" rel="noreferrer">
            thrixel.com
          </a>
          .
        </MonoMeta>
        {status?.connected ? (
          <div className="profile-thrixel-connected">
            <ThrixelCreditsBanner
              balanceLabel={credits.balanceLabel}
              plan={credits.account?.plan ?? null}
              loading={credits.loading}
              error={credits.error}
            />
            <MonoMeta size="xs" tone="subtle">
              Add cubes on{' '}
              <a href="https://thrixel.com/create" target="_blank" rel="noreferrer">
                thrixel.com
              </a>
              .
            </MonoMeta>
            <div className="profile-thrixel-actions">
              <Badge tone="accent" dot>
                Connected
              </Badge>
              {status.connectedAt ? (
                <MonoMeta size="xs" tone="subtle">
                  since {formatRelativeTime(status.connectedAt)}
                </MonoMeta>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void handleDisconnect()}
              >
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="profile-thrixel-connect">
            <Input
              type="password"
              value={apiKey}
              disabled={busy}
              placeholder="sk-thrixel-…"
              onChange={(e) => setApiKey(e.target.value)}
            />
            <div>
              <Button
                size="sm"
                disabled={busy || !apiKey.trim()}
                onClick={() => void handleConnect()}
              >
                Connect Thrixel
              </Button>
            </div>
          </div>
        )}
        {error ? <Banner tone="error">{error}</Banner> : null}
      </Field>
    </div>
  );
}
