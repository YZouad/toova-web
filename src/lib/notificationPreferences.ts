import { supabase } from './supabase';

export type NotificationPreferences = {
  email_likes: boolean;
  email_copies: boolean;
  email_model_ready: boolean;
  email_finish_room: boolean;
  email_credits: boolean;
  email_move_in: boolean;
  email_unsubscribed_all: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  email_likes: true,
  email_copies: true,
  email_model_ready: true,
  email_finish_room: true,
  email_credits: true,
  email_move_in: true,
  email_unsubscribed_all: false,
};

const SELECT_COLS =
  'email_likes, email_copies, email_model_ready, email_finish_room, email_credits, email_move_in, email_unsubscribed_all';

function parsePrefs(row: Record<string, unknown> | null): NotificationPreferences {
  if (!row) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  return {
    email_likes: row.email_likes !== false,
    email_copies: row.email_copies !== false,
    email_model_ready: row.email_model_ready !== false,
    email_finish_room: row.email_finish_room !== false,
    email_credits: row.email_credits !== false,
    email_move_in: row.email_move_in !== false,
    email_unsubscribed_all: row.email_unsubscribed_all === true,
  };
}

export async function fetchNotificationPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  const { data, error } = await supabase
    .from('notification_prefs')
    .select(SELECT_COLS)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return parsePrefs(data as Record<string, unknown>);

  const { data: inserted, error: insertError } = await supabase
    .from('notification_prefs')
    .insert({ user_id: userId })
    .select(SELECT_COLS)
    .single();
  if (insertError) {
    // Concurrent bootstrap: another tab may have inserted first.
    const { data: retry, error: retryError } = await supabase
      .from('notification_prefs')
      .select(SELECT_COLS)
      .eq('user_id', userId)
      .maybeSingle();
    if (retryError) throw new Error(retryError.message);
    if (retry) return parsePrefs(retry as Record<string, unknown>);
    throw new Error(insertError.message);
  }
  return parsePrefs(inserted as Record<string, unknown>);
}

export async function updateNotificationPreferences(
  userId: string,
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const payload = {
    ...patch,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('notification_prefs')
    .update(payload)
    .eq('user_id', userId)
    .select(SELECT_COLS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return parsePrefs(data as Record<string, unknown>);

  // Row missing (race / first visit): upsert defaults + patch.
  const { data: upserted, error: upsertError } = await supabase
    .from('notification_prefs')
    .upsert(
      {
        user_id: userId,
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        ...patch,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select(SELECT_COLS)
    .single();
  if (upsertError) throw new Error(upsertError.message);
  return parsePrefs(upserted as Record<string, unknown>);
}
