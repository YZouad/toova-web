import { supabase } from './supabase';

export class TrellisInsufficientCreditsError extends Error {
  readonly code = 'insufficient_credits' as const;
  readonly cost?: number;
  readonly monthlyBalance?: number;
  readonly purchasedBalance?: number;

  constructor(
    message: string,
    details?: { cost?: number; monthlyBalance?: number; purchasedBalance?: number },
  ) {
    super(message);
    this.name = 'TrellisInsufficientCreditsError';
    this.cost = details?.cost;
    this.monthlyBalance = details?.monthlyBalance;
    this.purchasedBalance = details?.purchasedBalance;
  }
}

export function newGenerationRef(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `gen_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function trellisAuthHeaders(
  generationRef?: string,
): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Sign in to generate 3D models.');
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (generationRef) {
    headers['X-Toova-Generation-Ref'] = generationRef;
  }
  return headers;
}
