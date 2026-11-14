import axios from "axios";
import type {
  UserSummary,
  AttendanceStatusSummary,
  AttendanceEvent,
  DailyMonitorResponse,
  AuditLog,
  RoleName,
  OfficeLocationConfig,
  ScanLocationPayload,
  OfflineSyncItemPayload,
  OfflineSyncResponse,
} from "../types";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" && window.location.hostname
    ? `http://${window.location.hostname}:8000/api/v1`
    : "http://localhost:8000/api/v1");

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach Bearer token from localStorage
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("sp_attendance_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 Unauthorized globally
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("sp_attendance_token");
      localStorage.removeItem("sp_attendance_user");
      // If we are not already on the login page, redirect
      if (window.location.pathname !== "/login" && window.location.pathname !== "/") {
        window.location.href = "/";
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  register: async (fullName: string, phoneNumber: string, pin: string, confirmPin: string) => {
    const res = await apiClient.post<{ access_token: string; user: UserSummary }>(
      "/auth/register",
      {
        full_name: fullName,
        phone_number: phoneNumber,
        pin,
        confirm_pin: confirmPin,
      }
    );
    return res.data;
  },

  login: async (phoneNumber: string, pin: string) => {
    const res = await apiClient.post<{ access_token: string; user: UserSummary }>(
      "/auth/login",
      {
        phone_number: phoneNumber,
        pin,
      }
    );
    return res.data;
  },

  getMe: async () => {
    const res = await apiClient.get<UserSummary>("/auth/me");
    return res.data;
  },

  bootstrapSuperAdmin: async (token: string, phoneNumber: string, fullName: string, pin?: string) => {
    const res = await apiClient.post<{ access_token: string; user: UserSummary }>(
      "/auth/bootstrap-super-admin",
      {
        bootstrap_token: token,
        phone_number: phoneNumber,
        full_name: fullName,
        pin: pin || "123456",
      }
    );
    return res.data;
  },
};

export const attendanceAPI = {
  getTodayStatus: async (): Promise<AttendanceStatusSummary> => {
    const res = await apiClient.get<AttendanceStatusSummary>("/attendance/today-status");
    return res.data;
  },

  scan: async (payload: ScanLocationPayload): Promise<AttendanceEvent> => {
    const res = await apiClient.post<AttendanceEvent>("/attendance/scan", payload);
    return res.data;
  },

  getHistory: async (startDate?: string, endDate?: string): Promise<AttendanceEvent[]> => {
    const params: Record<string, string> = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    const res = await apiClient.get<AttendanceEvent[]>("/attendance/history", { params });
    return res.data;
  },

  syncOffline: async (events: OfflineSyncItemPayload[]): Promise<OfflineSyncResponse> => {
    const res = await apiClient.post<OfflineSyncResponse>("/attendance/sync-offline", { events });
    return res.data;
  },
};

export const qrAPI = {
  getOfficeStatic: async (): Promise<{
    token: string;
    raw_code: string;
    organization_code: string;
    organization_name: string;
    office_latitude: number;
    office_longitude: number;
    geofence_radius_meters: number;
    verification_mode: string;
  }> => {
    const res = await apiClient.get("/qr/office-static");
    return res.data;
  },

  downloadPrintPdf: async (): Promise<Blob> => {
    const res = await apiClient.get("/qr/print-pdf", {
      responseType: "blob",
    });
    return res.data;
  },
};

export const adminAPI = {
  getDailyMonitor: async (targetDate?: string): Promise<DailyMonitorResponse> => {
    const params: Record<string, string> = {};
    if (targetDate) params.target_date = targetDate;
    const res = await apiClient.get<DailyMonitorResponse>("/admin/daily-monitor", { params });
    return res.data;
  },

  listStaff: async (): Promise<UserSummary[]> => {
    const res = await apiClient.get<UserSummary[]>("/admin/staff");
    return res.data;
  },

  manualAdd: async (data: {
    user_id: string;
    event_type: string;
    event_date: string;
    scanned_at: string;
    reason: string;
  }): Promise<AttendanceEvent> => {
    const res = await apiClient.post<AttendanceEvent>("/admin/attendance/manual-add", data);
    return res.data;
  },

  correct: async (data: {
    record_id: string;
    new_event_type?: string;
    new_scanned_at?: string;
    reason: string;
  }): Promise<AttendanceEvent> => {
    const res = await apiClient.put<AttendanceEvent>("/admin/attendance/correct", data);
    return res.data;
  },

  getAuditLogs: async (): Promise<AuditLog[]> => {
    const res = await apiClient.get<AuditLog[]>("/admin/audit-logs");
    return res.data;
  },

  getStaffHistory: async (userId: string, startDate?: string, endDate?: string): Promise<AttendanceEvent[]> => {
    const params: Record<string, string> = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    const res = await apiClient.get<AttendanceEvent[]>(`/admin/staff/${userId}/history`, { params });
    return res.data;
  },

  updateUserRole: async (userId: string, roleName: RoleName) => {
    const res = await apiClient.put(`/admin/users/${userId}/role`, { role_name: roleName });
    return res.data;
  },

  resetPin: async (userId: string, newPin: string, confirmPin: string, reason: string) => {
    const res = await apiClient.post(`/admin/users/${userId}/reset-pin`, {
      new_pin: newPin,
      confirm_pin: confirmPin,
      reason,
    });
    return res.data;
  },

  getOfficeLocation: async (): Promise<OfficeLocationConfig> => {
    const res = await apiClient.get<OfficeLocationConfig>("/admin/office-location");
    return res.data;
  },

  updateOfficeLocation: async (data: {
    office_latitude: number;
    office_longitude: number;
    geofence_radius_meters: number;
    reason: string;
  }): Promise<OfficeLocationConfig> => {
    const res = await apiClient.patch<OfficeLocationConfig>("/admin/office-location", data);
    return res.data;
  },
};

export const reportsAPI = {
  downloadWeekly: async (startDate?: string, language: "en" | "mr" = "en"): Promise<Blob> => {
    const params: Record<string, string> = { lang: language, language };
    if (startDate) {
      params.start_date = startDate;
      params.week_date = startDate;
    }
    const res = await apiClient.get("/admin/reports/weekly.pdf", {
      params,
      responseType: "blob",
    });
    return res.data;
  },

  downloadMonthly: async (year?: number, month?: number, language: "en" | "mr" = "en"): Promise<Blob> => {
    const params: Record<string, any> = { lang: language, language };
    if (year) params.year = year;
    if (month) params.month = month;
    const res = await apiClient.get("/admin/reports/monthly.pdf", {
      params,
      responseType: "blob",
    });
    return res.data;
  },
};
