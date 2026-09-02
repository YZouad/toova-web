import { type ReactNode } from 'react';
import { useShoppingCatalog } from '../hooks/useShoppingCatalog';
import { ShoppingCatalogContext } from './shoppingCatalogState';

export { useShoppingCatalogContext } from './shoppingCatalogState';

export function ShoppingCatalogProvider({
  roomId,
  children,
}: {
  roomId: string | null;
  children: ReactNode;
}) {
  const api = useShoppingCatalog(roomId);
  return (
    <ShoppingCatalogContext.Provider value={api}>
      {children}
    </ShoppingCatalogContext.Provider>
  );
}
