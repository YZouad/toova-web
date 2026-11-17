import { type ReactNode } from 'react';
import { useShoppingCatalog } from '../hooks/useShoppingCatalog';
import type { ChecklistLoadMode } from './ChecklistRoomContext';
import { ShoppingCatalogContext } from './shoppingCatalogState';

export { useShoppingCatalogContext } from './shoppingCatalogState';

export function ShoppingCatalogProvider({
  roomId,
  checklistLoadMode = 'full',
  children,
}: {
  roomId: string | null;
  checklistLoadMode?: ChecklistLoadMode;
  children: ReactNode;
}) {
  const api = useShoppingCatalog(roomId, { checklistLoadMode });
  return (
    <ShoppingCatalogContext.Provider value={api}>
      {children}
    </ShoppingCatalogContext.Provider>
  );
}
