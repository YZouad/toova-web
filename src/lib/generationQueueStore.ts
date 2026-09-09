/** IndexedDB persistence for photo→3D jobs so the queue survives tab close. */

const DB_NAME = 'toova-generation-queue';
const DB_VERSION = 1;
const STORE = 'assets';

export type GenerationAssetKind = 'source' | 'result';

export type GenerationAssetRecord = {
  jobId: string;
  userId: string;
  label: string;
  kind: GenerationAssetKind;
  blob: Blob;
  fileName: string;
  type: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'jobId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
}

function reqAs<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB request failed'));
  });
}

export function fileFromAsset(record: GenerationAssetRecord): File {
  return new File([record.blob], record.fileName || 'file', {
    type: record.type || record.blob.type || 'application/octet-stream',
  });
}

export async function putGenerationAsset(record: GenerationAssetRecord): Promise<void> {
  const db = await openDb();
  try {
    await reqAs(db.transaction(STORE, 'readwrite').objectStore(STORE).put(record));
  } finally {
    db.close();
  }
}

export async function getGenerationAsset(jobId: string): Promise<GenerationAssetRecord | null> {
  const db = await openDb();
  try {
    const row = await reqAs(
      db.transaction(STORE, 'readonly').objectStore(STORE).get(jobId),
    );
    return (row as GenerationAssetRecord | undefined) ?? null;
  } finally {
    db.close();
  }
}

export async function deleteGenerationAsset(jobId: string): Promise<void> {
  const db = await openDb();
  try {
    await reqAs(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(jobId));
  } finally {
    db.close();
  }
}

export async function listGenerationAssets(userId: string): Promise<GenerationAssetRecord[]> {
  const db = await openDb();
  try {
    const rows = await reqAs(
      db.transaction(STORE, 'readonly').objectStore(STORE).getAll(),
    );
    return ((rows as GenerationAssetRecord[]) ?? []).filter((row) => row.userId === userId);
  } finally {
    db.close();
  }
}
