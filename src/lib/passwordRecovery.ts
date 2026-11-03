const KEY = 'toova-password-recovery';

export function readPasswordRecoveryFlag(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markPasswordRecovery(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // Private mode / quota — recovery still works on this tab via in-memory state.
  }
}

export function clearPasswordRecoveryFlag(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/**
 * Recovery should open /reset-password once. After the user leaves that
 * screen (password saved, or they navigate away), do not pull them back.
 */
export function shouldOpenResetPasswordRoute(
  passwordRecovery: boolean,
  onResetRoute: boolean,
  alreadyOpened: boolean,
): { open: boolean; alreadyOpened: boolean } {
  if (!passwordRecovery) return { open: false, alreadyOpened: false };
  if (onResetRoute || alreadyOpened) return { open: false, alreadyOpened: true };
  return { open: true, alreadyOpened: true };
}
