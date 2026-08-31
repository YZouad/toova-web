import { createContext, useContext, type Context } from 'react';
import type { ShoppingCatalogApi } from '../hooks/useShoppingCatalog';

/**
 * Context object lives in a module that only type-imports the catalog hook.
 * That keeps the Context identity stable across Vite HMR when
 * `useShoppingCatalog.ts` hot-reloads (which previously recreated this
 * Context and made `useShoppingCatalogContext` throw inside a live Provider).
 */
function createShoppingCatalogContext(): Context<ShoppingCatalogApi | null> {
  if (import.meta.hot) {
    const data = import.meta.hot.data as {
      shoppingCatalogContext?: Context<ShoppingCatalogApi | null>;
    };
    data.shoppingCatalogContext ??= createContext<ShoppingCatalogApi | null>(null);
    return data.shoppingCatalogContext;
  }
  return createContext<ShoppingCatalogApi | null>(null);
}

export const ShoppingCatalogContext = createShoppingCatalogContext();

export function useShoppingCatalogContext(): ShoppingCatalogApi {
  const ctx = useContext(ShoppingCatalogContext);
  if (!ctx) {
    throw new Error('useShoppingCatalogContext must be used within ShoppingCatalogProvider');
  }
  return ctx;
}
