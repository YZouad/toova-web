import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button, Field, Input, MonoMeta } from './kit';

type BillingPayload = {
  entitlements?: {
    plan_code?: string;
    status?: string;
    credits_available?: number;
    features?: Record<string, unknown>;
  };
  subscriptions?: Array<Record<string, unknown>>;
  ledger?: Array<Record<string, unknown>>;
  overrides?: Array<Record<string, unknown>>;
};

export function AdminBillingPanel() {
  const [userId, setUserId] = useState('');
  const [payload, setPayload] = useState<BillingPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creditAmount, setCreditAmount] = useState('50');
  const [note, setNote] = useState('');

  const load = async () => {
    const id = userId.trim();
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('admin_get_user_billing', {
        p_user_id: id,
      });
      if (err) throw err;
      setPayload((data ?? null) as BillingPayload);
    } catch (err) {
      setPayload(null);
      setError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setBusy(false);
    }
  };

  const grantCredits = async () => {
    const id = userId.trim();
    const amount = Number(creditAmount);
    if (!id || !Number.isFinite(amount) || amount <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.rpc('admin_grant_credits', {
        p_user_id: id,
        p_amount: amount,
        p_note: note || null,
      });
      if (err) throw err;
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Grant failed');
      setBusy(false);
    }
  };

  const grantUnlimitedRooms = async () => {
    const id = userId.trim();
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.rpc('admin_grant_entitlement_override', {
        p_user_id: id,
        p_feature_key: 'max_rooms',
        p_limit_value: null,
        p_flag_value: null,
        p_note: note || 'admin override',
      });
      if (err) throw err;
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Override failed');
      setBusy(false);
    }
  };

  return (
    <div className="admin-billing">
      <h2>Billing lookup</h2>
      <p className="muted">Look up a user by auth UUID. Grant credits or entitlement overrides.</p>
      <div className="admin-billing__row">
        <Field label="User id">
          <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="uuid" />
        </Field>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void load()}>
          Load
        </Button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      {payload?.entitlements ? (
        <section className="admin-billing__section">
          <MonoMeta>
            Plan {String(payload.entitlements.plan_code)} · status{' '}
            {String(payload.entitlements.status)} · credits{' '}
            {String(payload.entitlements.credits_available ?? 0)}
          </MonoMeta>
          <pre className="admin-billing__pre">{JSON.stringify(payload.entitlements.features, null, 2)}</pre>
          <div className="admin-billing__row">
            <Field label="Grant credits">
              <Input value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} />
            </Field>
            <Field label="Note">
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <Button type="button" disabled={busy} onClick={() => void grantCredits()}>
              Grant credits
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void grantUnlimitedRooms()}>
              Unlimited rooms
            </Button>
          </div>
          <h3>Subscriptions</h3>
          <pre className="admin-billing__pre">{JSON.stringify(payload.subscriptions ?? [], null, 2)}</pre>
          <h3>Ledger (recent)</h3>
          <pre className="admin-billing__pre">{JSON.stringify(payload.ledger ?? [], null, 2)}</pre>
          <h3>Overrides</h3>
          <pre className="admin-billing__pre">{JSON.stringify(payload.overrides ?? [], null, 2)}</pre>
        </section>
      ) : null}
    </div>
  );
}
