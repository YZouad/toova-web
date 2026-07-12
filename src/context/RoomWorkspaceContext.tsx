import { createContext, useContext, type ReactNode } from 'react';

export interface RoomWorkspaceValue {
  id: string;
  name: string;
}

interface RoomWorkspaceCtx {
  workspace: RoomWorkspaceValue | null;
  /** Return to room list; clears planner state. */
  exitWorkspace: () => void;
}

const RoomWorkspaceContext = createContext<RoomWorkspaceCtx | null>(null);

export function RoomWorkspaceProvider({
  value,
  children,
}: {
  value: RoomWorkspaceCtx;
  children: ReactNode;
}) {
  return (
    <RoomWorkspaceContext.Provider value={value}>{children}</RoomWorkspaceContext.Provider>
  );
}

export function useRoomWorkspace(): RoomWorkspaceCtx {
  const ctx = useContext(RoomWorkspaceContext);
  if (!ctx) throw new Error('useRoomWorkspace must be used within RoomWorkspaceProvider');
  return ctx;
}
