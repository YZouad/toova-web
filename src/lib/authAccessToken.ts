import { supabase } from './supabase';

/** Fresh user access token for Edge Functions / BFF calls (validates session server-side). */
export async function requireAccessToken(message = 'Sign in to continue.'): Promise<string> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error(message);
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error(message);
  return token;
}
