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
