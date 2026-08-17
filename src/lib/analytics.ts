declare global {
  interface Window {
    dataLayer: IArguments[];
    gtag: (...args: unknown[]) => void;
  }
}

const GA_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined)?.trim();

let initialized = false;

export function initAnalytics(): void {
  if (initialized) return;
  if (!GA_ID) {
    if (import.meta.env.DEV) {
      console.info('[analytics] VITE_GA_MEASUREMENT_ID is not set — skipping');
    }
    return;
  }
  initialized = true;

  window.dataLayer = window.dataLayer || [];
  // Official gtag snippet pushes `arguments` (not a rest-parameter Array).
  // Pushing an Array breaks the queued command processor, so no /g/collect hits fire.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };

  window.gtag('js', new Date());
  window.gtag('config', GA_ID, {
    // SPA navigations send page_view explicitly via trackPageView.
    send_page_view: false,
    // Surfaces events in GA Admin → DebugView while developing.
    ...(import.meta.env.DEV ? { debug_mode: true } : {}),
  });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  script.onload = () => {
    if (import.meta.env.DEV) {
      console.info('[analytics] gtag.js loaded', GA_ID);
    }
  };
  script.onerror = () => {
    console.warn(
      '[analytics] Failed to load gtag.js — disable ad blockers / tracking prevention for localhost',
    );
  };
  document.head.appendChild(script);

  if (import.meta.env.DEV) {
    console.info('[analytics] initialized', GA_ID);
  }
}

export function trackPageView(path?: string): void {
  if (!GA_ID || !window.gtag) return;
  const pagePath = path ?? `${window.location.pathname}${window.location.search}`;
  window.gtag('event', 'page_view', {
    page_path: pagePath,
    page_title: document.title,
    page_location: `${window.location.origin}${pagePath}`,
  });
}

export function trackEvent(
  name: string,
  params?: Record<string, string | number | boolean>,
): void {
  if (!GA_ID || !window.gtag) return;
  window.gtag('event', name, params);
}

export function trackLogin(method: string): void {
  trackEvent('login', { method });
}

export function trackSignUp(method: string): void {
  trackEvent('sign_up', { method });
}

export function trackCreateRoom(params?: {
  template_id?: string;
  guest_restore?: boolean;
}): void {
  trackEvent('create_room', {
    ...(params?.template_id ? { template_id: params.template_id } : {}),
    ...(params?.guest_restore != null ? { guest_restore: params.guest_restore } : {}),
  });
}

export function trackAddToDesign(params: {
  kind: string;
  source?: string;
  curated_product_id?: string;
}): void {
  trackEvent('add_to_design', {
    kind: params.kind,
    ...(params.source ? { source: params.source } : {}),
    ...(params.curated_product_id
      ? { curated_product_id: params.curated_product_id }
      : {}),
  });
}

export function trackShareRoom(params?: { role?: string }): void {
  trackEvent('share_room', {
    ...(params?.role ? { role: params.role } : {}),
  });
}

export function trackAffiliateClick(params: {
  retailer?: string;
  product_id?: string;
  approximate?: boolean;
  source?: string;
}): void {
  trackEvent('click_affiliate', {
    ...(params.retailer ? { retailer: params.retailer } : {}),
    ...(params.product_id ? { product_id: params.product_id } : {}),
    ...(params.approximate != null ? { approximate: params.approximate } : {}),
    ...(params.source ? { source: params.source } : {}),
  });
}
