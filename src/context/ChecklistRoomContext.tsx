import { createContext, useContext, useState, type ReactNode } from 'react';
import { getActiveChecklistRoomId } from '../lib/dormChecklist';
import { ShoppingCatalogProvider } from './ShoppingCatalogContext';

export type ChecklistLoadMode = 'full' | 'lists-only';

interface ChecklistRoomScope {
  roomId: string | null;
  setRoomId: (roomId: string | null) => void;
  checklistLoadMode: ChecklistLoadMode;
  setChecklistLoadMode: (mode: ChecklistLoadMode) => void;
}

const ChecklistRoomContext = createContext<ChecklistRoomScope | null>(null);

export function ChecklistRoomProvider({ children }: { children: ReactNode }) {
  const [roomId, setRoomId] = useState<string | null>(() => getActiveChecklistRoomId());
  const [checklistLoadMode, setChecklistLoadMode] = useState<ChecklistLoadMode>('full');
  return (
    <ChecklistRoomContext.Provider
      value={{ roomId, setRoomId, checklistLoadMode, setChecklistLoadMode }}
    >
      <ShoppingCatalogProvider roomId={roomId} checklistLoadMode={checklistLoadMode}>
        {children}
      </ShoppingCatalogProvider>
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
