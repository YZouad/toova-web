import {
  createContext,
  useContext,
  type ReactNode,
} from 'react';
import {
  useShoppingCatalog,
  type ShoppingCatalogApi,
} from '../hooks/useShoppingCatalog';

const ShoppingCatalogContext = createContext<ShoppingCatalogApi | null>(null);

export function ShoppingCatalogProvider({ children }: { children: ReactNode }) {
  const api = useShoppingCatalog();
  return (
    <ShoppingCatalogContext.Provider value={api}>
      {children}
    </ShoppingCatalogContext.Provider>
  );
}

export function useShoppingCatalogContext(): ShoppingCatalogApi {
  const ctx = useContext(ShoppingCatalogContext);
  if (!ctx) {
    throw new Error('useShoppingCatalogContext must be used within ShoppingCatalogProvider');
  }
  return ctx;
}
