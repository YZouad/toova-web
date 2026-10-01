import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from './kit/Button';
import { DisplayHeading } from './kit/DisplayHeading';
import { Field } from './kit/Field';
import { Input } from './kit/Input';
import { Spinner } from './kit/Spinner';

interface BundleRow {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  sort_order: number;
}

export function AdminBundlesPanel() {
  const [rows, setRows] = useState<BundleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: qErr } = await supabase
      .from('bundles')
      .select('id, slug, title, published, sort_order')
      .order('sort_order')
      .order('title');
    if (qErr) setError(qErr.message);
    else setRows((data ?? []) as BundleRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createBundle() {
    if (!slug.trim() || !title.trim()) return;
    setBusy(true);
    setError(null);
    const { error: insErr } = await supabase.from('bundles').insert({
      slug: slug.trim().toLowerCase().replace(/\s+/g, '-'),
      title: title.trim(),
      published: false,
    });
    setBusy(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    setSlug('');
    setTitle('');
    await refresh();
  }

  async function togglePublished(id: string, published: boolean) {
    await supabase.from('bundles').update({ published: !published }).eq('id', id);
    await refresh();
  }

  if (loading) return <Spinner label="Loading bundles…" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <DisplayHeading level={3}>
        Affiliate bundles
      </DisplayHeading>
      <p style={{ margin: 0, maxWidth: 560, lineHeight: 1.5 }}>
        Create bundle shells here, then attach products in Supabase (`bundle_items`). Use co-occurrence
        hints from Usage → bundle suggestions when curating dorm packs.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
        <Field label="Slug">
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="dorm-essentials" />
        </Field>
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dorm essentials pack" />
        </Field>
        <Button size="sm" disabled={busy} onClick={() => void createBundle()}>
          Create bundle
        </Button>
      </div>

      {error ? <div className="tv-banner-error">{error}</div> : null}

      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {rows.map((row) => (
          <li
            key={row.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 0',
              borderBottom: '1px solid var(--rule-soft)',
            }}
          >
            <span>
              <strong>{row.title}</strong> · <code>{row.slug}</code>
            </span>
            <Button size="sm" variant="outline" onClick={() => void togglePublished(row.id, row.published)}>
              {row.published ? 'Unpublish' : 'Publish'}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
