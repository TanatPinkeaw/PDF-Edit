/**
 * Output files for the history page, kept in IndexedDB so a finished job can be
 * downloaded again without uploading anything: the PDF never leaves the
 * browser, and the record disappears with the browser profile.
 *
 * Entries older than `RUN_FILE_TTL_DAYS` are deleted while the list is read, so
 * the store stays inside the one-month history window without a background job.
 */

const DB_NAME = 'pdfstudio.run-files';
const DB_VERSION = 1;
const STORE = 'files';

export const RUN_FILE_TTL_DAYS = 30;

export type RunFile = {
  runId: string;
  name: string;
  mime: string;
  bytes: Uint8Array;
  savedAt: number;
};

/** True once a saved output is past the retention window. */
export function isRunFileExpired(savedAt: number, now = Date.now()): boolean {
  return now - savedAt > RUN_FILE_TTL_DAYS * 24 * 60 * 60 * 1000;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'runId' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // A newer tab may want to upgrade the schema; never block it.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

/** Removes outputs past the retention window. Safe to call at any time. */
export async function pruneRunFiles(now = Date.now()): Promise<number> {
  const db = await openDb();
  if (!db) return 0;

  try {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    const all = await requestResult(store.getAll() as IDBRequest<RunFile[]>);
    if (!all) return 0;

    let removed = 0;
    for (const entry of all) {
      if (!isRunFileExpired(entry.savedAt, now)) continue;
      store.delete(entry.runId);
      removed += 1;
    }
    return removed;
  } catch (error) {
    console.warn('ล้างไฟล์ประวัติเก่าไม่สำเร็จ', error);
    return 0;
  }
}

/** Stores the output of a finished run. Failures are non-fatal: history loses
 * only the download, not the row. */
export async function saveRunFile(
  runId: string,
  output: { name: string; bytes: Uint8Array; mime: string },
): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;

  const entry: RunFile = {
    runId,
    name: output.name,
    mime: output.mime,
    bytes: output.bytes,
    savedAt: Date.now(),
  };

  try {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    const saved = await requestResult(store.put(entry) as unknown as IDBRequest<IDBValidKey>);
    if (saved === null) return false;
    void pruneRunFiles();
    return true;
  } catch (error) {
    // Quota exceeded is the usual reason; the run itself still succeeded.
    console.warn('เก็บไฟล์ผลลัพธ์ไว้ในประวัติไม่สำเร็จ', error);
    return false;
  }
}

export async function loadRunFile(runId: string): Promise<RunFile | null> {
  const db = await openDb();
  if (!db) return null;

  try {
    const store = db.transaction(STORE, 'readonly').objectStore(STORE);
    const entry = await requestResult(store.get(runId) as IDBRequest<RunFile | undefined>);
    if (!entry) return null;
    if (isRunFileExpired(entry.savedAt)) {
      void deleteRunFile(runId);
      return null;
    }
    return entry;
  } catch (error) {
    console.warn('เปิดไฟล์จากประวัติไม่สำเร็จ', error);
    return null;
  }
}

/** Ids that still have a downloadable file in this browser. */
export async function listRunFileIds(): Promise<Set<string>> {
  const db = await openDb();
  if (!db) return new Set();

  try {
    await pruneRunFiles();
    const store = db.transaction(STORE, 'readonly').objectStore(STORE);
    const keys = await requestResult(store.getAllKeys() as IDBRequest<IDBValidKey[]>);
    return new Set((keys ?? []).map(String));
  } catch (error) {
    console.warn('อ่านรายการไฟล์ในประวัติไม่สำเร็จ', error);
    return new Set();
  }
}

export async function deleteRunFile(runId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;

  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete(runId);
  } catch (error) {
    console.warn('ลบไฟล์ในประวัติไม่สำเร็จ', error);
  }
}

/** Used when history or the whole account is deleted from this browser. */
export async function clearRunFiles(): Promise<void> {
  const db = await openDb();
  if (!db) return;

  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
  } catch (error) {
    console.warn('ล้างไฟล์ในประวัติไม่สำเร็จ', error);
  }
}
