import { supabase } from './supabase';

export class AccountDeletionError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'AccountDeletionError';
  }
}

/** Permanently erase the signed-in account via the delete-account edge function. */
export async function deleteOwnAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { body: {} });
  if (!error) return;
  let code = 'delete_failed';
  let message = 'We couldn’t delete your account. Please try again.';
  const context = (error as { context?: Response }).context;
  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as { error?: string; message?: string };
      if (body?.error) code = body.error;
      if (body?.message) message = body.message;
    } catch {
      /* keep defaults */
    }
  }
  throw new AccountDeletionError(message, code);
}
