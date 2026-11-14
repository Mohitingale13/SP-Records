import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { OfflineAttendanceRecord, OfflineSyncResponse, AttendanceEventType } from "../types";
import { offlineStorage } from "../services/offlineStorage";
import { attendanceAPI } from "../services/api";

interface OfflineContextType {
  isOnline: boolean;
  pendingCount: number;
  pendingRecords: OfflineAttendanceRecord[];
  isSyncing: boolean;
  lastSyncTime: Date | null;
  lastSyncMessage: string | null;
  saveOfflineAttendance: (params: {
    eventType: AttendanceEventType;
    latitude: number;
    longitude: number;
    accuracy: number;
    qrToken?: string;
    locationTimestamp?: string;
  }) => Promise<OfflineAttendanceRecord>;
  syncNow: () => Promise<OfflineSyncResponse | null>;
  refreshPendingCount: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export const OfflineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendingRecords, setPendingRecords] = useState<OfflineAttendanceRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [lastSyncMessage, setLastSyncMessage] = useState<string | null>(null);

  const refreshPendingCount = useCallback(async () => {
    try {
      const pending = await offlineStorage.getPendingRecords();
      setPendingRecords(pending);
    } catch (err) {
      console.error("Failed to read pending offline records:", err);
    }
  }, []);

  const syncNow = useCallback(async (): Promise<OfflineSyncResponse | null> => {
    const online = typeof navigator !== "undefined" ? navigator.onLine : true;
    if (!online) {
      return null;
    }

    try {
      const pending = await offlineStorage.getPendingRecords();
      if (pending.length === 0) {
        return null;
      }

      setIsSyncing(true);

      const payload = pending.map((rec) => ({
        offline_id: rec.id,
        event_type: rec.event_type,
        qr_token: rec.qr_token,
        latitude: rec.latitude,
        longitude: rec.longitude,
        accuracy: rec.accuracy,
        scanned_at: rec.scanned_at,
        location_timestamp: rec.location_timestamp,
      }));

      const res = await attendanceAPI.syncOffline(payload);

      // Update storage status according to individual event results
      const statusUpdates: { id: string; status: "SYNCED" | "FAILED"; error?: string }[] = [];
      for (const result of res.results) {
        if (result.status === "SYNCED" || result.status === "ALREADY_EXISTS") {
          statusUpdates.push({ id: result.offline_id, status: "SYNCED" });
        } else {
          statusUpdates.push({ id: result.offline_id, status: "FAILED", error: result.message });
        }
      }

      await offlineStorage.updateRecordsStatus(statusUpdates);
      await offlineStorage.clearSyncedRecords();

      const updatedPending = await offlineStorage.getPendingRecords();
      setPendingRecords(updatedPending);
      setLastSyncTime(new Date());

      if (res.synced_count > 0) {
        setLastSyncMessage(`${res.synced_count} offline record(s) synced to cloud successfully!`);
      } else if (res.already_exists_count > 0 && res.failed_count === 0) {
        setLastSyncMessage("All pending records were already up to date.");
      }

      return res;
    } catch (err: any) {
      console.error("Offline sync error:", err);
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const saveOfflineAttendance = useCallback(
    async (params: {
      eventType: AttendanceEventType;
      latitude: number;
      longitude: number;
      accuracy: number;
      qrToken?: string;
      locationTimestamp?: string;
    }): Promise<OfflineAttendanceRecord> => {
      const nowIso = new Date().toISOString();
      const saved = await offlineStorage.saveOfflineRecord({
        event_type: params.eventType,
        latitude: params.latitude,
        longitude: params.longitude,
        accuracy: params.accuracy,
        qr_token: params.qrToken,
        scanned_at: nowIso,
        location_timestamp: params.locationTimestamp || nowIso,
      });

      await refreshPendingCount();

      // If we happen to be online, trigger immediate background sync
      if (typeof navigator !== "undefined" && navigator.onLine) {
        syncNow();
      }

      return saved;
    },
    [refreshPendingCount, syncNow]
  );

  useEffect(() => {
    refreshPendingCount();

    const handleOnline = () => {
      setIsOnline(true);
      // Auto-sync whenever internet connectivity restores
      syncNow();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial check on mount: if online and pending, sync
    if (typeof navigator !== "undefined" && navigator.onLine) {
      syncNow();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refreshPendingCount, syncNow]);

  const value: OfflineContextType = {
    isOnline,
    pendingCount: pendingRecords.length,
    pendingRecords,
    isSyncing,
    lastSyncTime,
    lastSyncMessage,
    saveOfflineAttendance,
    syncNow,
    refreshPendingCount,
  };

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
};

export const useOffline = (): OfflineContextType => {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error("useOffline must be used within an OfflineProvider");
  }
  return context;
};

