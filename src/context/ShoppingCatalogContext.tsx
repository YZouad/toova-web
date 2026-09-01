import { type ReactNode } from 'react';
import { useShoppingCatalog } from '../hooks/useShoppingCatalog';
import { ShoppingCatalogContext } from './shoppingCatalogState';

export { useShoppingCatalogContext } from './shoppingCatalogState';

export function ShoppingCatalogProvider({ children }: { children: ReactNode }) {
  const api = useShoppingCatalog();
  return (
    <ShoppingCatalogContext.Provider value={api}>
      {children}
    </ShoppingCatalogContext.Provider>
  );
}
