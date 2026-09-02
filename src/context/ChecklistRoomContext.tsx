import { createContext, useContext, useState, type ReactNode } from 'react';
import { getActiveChecklistRoomId } from '../lib/dormChecklist';
import { ShoppingCatalogProvider } from './ShoppingCatalogContext';

interface ChecklistRoomScope {
  roomId: string | null;
  setRoomId: (roomId: string | null) => void;
}

const ChecklistRoomContext = createContext<ChecklistRoomScope | null>(null);

export function ChecklistRoomProvider({ children }: { children: ReactNode }) {
  const [roomId, setRoomId] = useState<string | null>(() => getActiveChecklistRoomId());
  return (
    <ChecklistRoomContext.Provider value={{ roomId, setRoomId }}>
      <ShoppingCatalogProvider roomId={roomId}>{children}</ShoppingCatalogProvider>
    </ChecklistRoomContext.Provider>
  );
}

export function useChecklistRoomScope(): ChecklistRoomScope {
  const ctx = useContext(ChecklistRoomContext);
  if (!ctx) {
    throw new Error('useChecklistRoomScope must be used within ChecklistRoomProvider');
  }
  return ctx;
}
