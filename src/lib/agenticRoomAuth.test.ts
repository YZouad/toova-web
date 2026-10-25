import { describe, expect, it } from 'vitest';
import {
  explainAgenticRoomAuthError,
  isMissingAuthorizationError,
  type AgenticRoomAuthDiagnostics,
} from './agenticRoomAuth';

function diag(overrides: Partial<AgenticRoomAuthDiagnostics>): AgenticRoomAuthDiagnostics {
  return {
    route: 'parse',
    hasSession: false,
    userId: null,
    userEmail: null,
    tokenLength: 0,
    expiresAt: null,
    expiresInSec: null,
    sentAuthorization: false,
    getSessionError: null,
    ...overrides,
  };
}

describe('agenticRoomAuth helpers', () => {
  it('detects missing authorization errors', () => {
    expect(isMissingAuthorizationError('Missing Authorization header.')).toBe(true);
    expect(isMissingAuthorizationError('Invalid or expired session.')).toBe(false);
  });

  it('explains when no session token was available', () => {
    const msg = explainAgenticRoomAuthError(
      diag({ hasSession: false, tokenLength: 0 }),
      'Missing Authorization header.',
    );
    expect(msg).toMatch(/no Supabase session token/i);
    expect(msg).toMatch(/tokenLength=0/);
  });

  it('explains when token was sent but BFF still rejected', () => {
    const msg = explainAgenticRoomAuthError(
      diag({
        hasSession: true,
        userId: 'user-1',
        tokenLength: 120,
        sentAuthorization: true,
      }),
      'Missing Authorization header.',
    );
    expect(msg).toMatch(/client sent Authorization/i);
    expect(msg).toMatch(/user-1/);
  });

  it('passes through unrelated errors', () => {
    expect(explainAgenticRoomAuthError(diag({}), 'Bedrock timeout')).toBe('Bedrock timeout');
  });
});
