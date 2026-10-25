import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { dbRowToItem, type RoomItemRow } from '../lib/roomLayoutSerialize';
import { signModelObjectPath } from '../lib/modelStorage';
import { useStore } from '../store';

async function hydrateImportedUrls(
  item: NonNullable<ReturnType<typeof dbRowToItem>>,
): Promise<NonNullable<ReturnType<typeof dbRowToItem>>> {
  if (item.kind !== 'imported' || !item.importedStoragePath) return item;
  try {
    const signed = await signModelObjectPath(item.importedStoragePath);
    if (!signed) return item;
    return { ...item, importedUrl: signed };
  } catch {
    return item;
  }
}

export function useScanJobUpdates(roomId: string | null): void {
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`scan-items-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'room_items',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const row = payload.new as RoomItemRow;
          if (!row.scan_object_id) return;
          void (async () => {
            const base = dbRowToItem(row);
            if (!base) return;
            const item = await hydrateImportedUrls(base);
            useStore.getState().patchScanItem(item);
          })();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId]);
}
