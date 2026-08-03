import { supabase } from './supabase';

const SUPABASE_URL = 'https://xfifgtedssabneqlxbhf.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_BKydIgobs2Vj7Wf-PNCl_w_FUm4y2xv';

/**
 * Fire-and-forget: ask GitHub Actions to regenerate static OG pages.
 * Failures are swallowed so share/visibility UX is never blocked.
 */
export async function requestUnfurlDeploy(): Promise<void> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/request-unfurl-deploy`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: '{}',
      },
    );
    if (!res.ok) {
      console.warn('[unfurl] redeploy request failed', res.status);
    }
  } catch (err) {
    console.warn('[unfurl] redeploy request error', err);
  }
}
