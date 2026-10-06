/**
 * Where to land after Stripe Checkout. The designer is not a URL, so a cancel
 * that only returns to "/" boots the marketing page. We remember the screen
 * (and room) in this tab, and point Stripe at the current page.
 */

const KEY = 'toova-checkout-return';
const TTL_MS = 30 * 60 * 1000;

const ROOM_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CheckoutReturn {
  path: string;
  screen?: string;
  roomId?: string;
  roomName?: string;
  isOwner?: boolean;
  at: number;
}

export interface CheckoutReturnContext {
  screen?: string;
  roomId?: string;
  roomName?: string;
  isOwner?: boolean;
}

let context: CheckoutReturnContext | null = null;

export function setCheckoutReturnContext(next: CheckoutReturnContext | null): void {
  context = next;
}

export function checkoutReturnPathname(path: string): string {
  const pathname = path.split('?')[0]?.split('#')[0] || '/';
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

export function checkoutReturnMatchesLocation(ret: CheckoutReturn, pathname: string): boolean {
  return checkoutReturnPathname(ret.path) === checkoutReturnPathname(pathname);
}

export function isPersistableRoomId(id: string | undefined): id is string {
  return typeof id === 'string' && ROOM_ID_RE.test(id);
}

/** Success and cancel URLs for the page the user is on right now. */
export function checkoutReturnUrls(href: string): { successUrl: string; cancelUrl: string } {
  const current = new URL(href);
  current.searchParams.delete('checkout');
  const success = new URL(current.toString());
  const cancel = new URL(current.toString());
  success.searchParams.set('checkout', 'success');
  cancel.searchParams.set('checkout', 'cancel');
  return { successUrl: success.toString(), cancelUrl: cancel.toString() };
}

export function rememberCheckoutReturn(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('checkout');
  const path = `${url.pathname}${url.search}` || '/';
  const payload: CheckoutReturn = {
    path,
    screen: context?.screen,
    roomId: context?.roomId,
    roomName: context?.roomName,
    isOwner: context?.isOwner,
    at: Date.now(),
  };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function peekCheckoutReturn(): CheckoutReturn | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CheckoutReturn>;
    if (!parsed || typeof parsed.path !== 'string' || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > TTL_MS) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return {
      path: parsed.path,
      screen: typeof parsed.screen === 'string' ? parsed.screen : undefined,
      roomId: typeof parsed.roomId === 'string' ? parsed.roomId : undefined,
      roomName: typeof parsed.roomName === 'string' ? parsed.roomName : undefined,
      isOwner: typeof parsed.isOwner === 'boolean' ? parsed.isOwner : undefined,
      at: parsed.at,
    };
  } catch {
    return null;
  }
}

export function consumeCheckoutReturn(): CheckoutReturn | null {
  const ret = peekCheckoutReturn();
  clearCheckoutReturn();
  return ret;
}

export function clearCheckoutReturn(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function stripCheckoutQuery(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('checkout')) return;
  url.searchParams.delete('checkout');
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(null, '', next);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function pendingDesignerCheckoutReturn(pathname = typeof window === 'undefined' ? '/' : window.location.pathname): boolean {
  const ret = peekCheckoutReturn();
  if (!ret || !checkoutReturnMatchesLocation(ret, pathname)) return false;
  if (checkoutReturnPathname(ret.path) !== '/') return false;
  return ret.screen === 'designer' && isPersistableRoomId(ret.roomId);
}
