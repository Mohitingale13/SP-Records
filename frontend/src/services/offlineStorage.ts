import type { OfflineAttendanceRecord } from "../types";

const DB_NAME = "SPAttendanceOfflineDB";
const DB_VERSION = 1;
const STORE_NAME = "offline_records";
const LOCAL_STORAGE_KEY = "sp_attendance_offline_queue";

// Helper for opening IndexedDB safely
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB not supported in this environment"));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("created_at", "created_at", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Fallback localStorage operations
function getLocalStorageRecords(): OfflineAttendanceRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalStorageRecords(records: OfflineAttendanceRecord[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(records));
  } catch (err) {
    console.error("Failed to write to localStorage fallback:", err);
  }
}

export const offlineStorage = {
  /**
   * Enqueues an offline attendance record with client-captured GPS coordinates and timestamp.
   */
  async saveOfflineRecord(
    data: Omit<OfflineAttendanceRecord, "id" | "status" | "created_at">
  ): Promise<OfflineAttendanceRecord> {
    const id = `offline_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const record: OfflineAttendanceRecord = {
      ...data,
      id,
      status: "PENDING",
      created_at: new Date().toISOString(),
    };

    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.add(record);

        req.onsuccess = () => {
          // Also sync to localStorage as redundancy
          const localList = getLocalStorageRecords().filter((r) => r.id !== id);
          setLocalStorageRecords([...localList, record]);
          resolve(record);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      // IndexedDB fallback to localStorage
      const localList = getLocalStorageRecords().filter((r) => r.id !== id);
      setLocalStorageRecords([...localList, record]);
      return record;
    }
  },

  /**
   * Retrieves all records currently waiting to be synced to the backend.
   */
  async getPendingRecords(): Promise<OfflineAttendanceRecord[]> {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();

        req.onsuccess = () => {
          const records: OfflineAttendanceRecord[] = req.result || [];
          const pending = records.filter((r) => r.status === "PENDING" || r.status === "SYNCING");
          resolve(pending);
        };
        req.onerror = () => {
          resolve(getLocalStorageRecords().filter((r) => r.status === "PENDING" || r.status === "SYNCING"));
        };
      });
    } catch {
      return getLocalStorageRecords().filter((r) => r.status === "PENDING" || r.status === "SYNCING");
    }
  },

  /**
   * Retrieves all stored records (pending, synced, failed).
   */
  async getAllRecords(): Promise<OfflineAttendanceRecord[]> {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();

        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve(getLocalStorageRecords());
      });
    } catch {
      return getLocalStorageRecords();
    }
  },

  /**
   * Updates status of specified records after sync attempt.
   */
  async updateRecordsStatus(
    updates: { id: string; status: "PENDING" | "SYNCING" | "SYNCED" | "FAILED"; error?: string }[]
  ): Promise<void> {
    const updateMap = new Map(updates.map((u) => [u.id, u]));

    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      for (const update of updates) {
        const getReq = store.get(update.id);
        getReq.onsuccess = () => {
          if (getReq.result) {
            const updated = {
              ...getReq.result,
              status: update.status,
              error: update.error || undefined,
            };
            store.put(updated);
          }
        };
      }
    } catch {
      // Fallback
    }

    // Always update localStorage fallback too
    const localList: OfflineAttendanceRecord[] = getLocalStorageRecords().map((item) => {
      const upd = updateMap.get(item.id);
      if (upd) {
        return { ...item, status: upd.status, error: upd.error || undefined };
      }
      return item;
    });
    setLocalStorageRecords(localList);
  },

  /**
   * Purges old synced records from storage to save space.
   */
  async clearSyncedRecords(): Promise<void> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const records: OfflineAttendanceRecord[] = req.result || [];
        for (const r of records) {
          if (r.status === "SYNCED") {
            store.delete(r.id);
          }
        }
      };
    } catch {
      // Fallback
    }

    const localList = getLocalStorageRecords().filter((r) => r.status !== "SYNCED");
    setLocalStorageRecords(localList);
  },
};
