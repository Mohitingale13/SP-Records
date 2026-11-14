export type RoleName = "SUPER_ADMIN" | "ADMIN" | "STAFF";

export interface UserSummary {
  id: string;
  full_name: string;
  phone_number: string;
  role: RoleName;
  organization_name: string;
}

export type AttendanceEventType =
  | "OFFICE_IN"
  | "LUNCH_BREAK_OUT"
  | "LUNCH_BREAK_IN"
  | "OFFICE_OUT";

export type AttendanceStatus =
  | "NOT_STARTED"
  | "CHECKED_IN"
  | "ON_LUNCH_BREAK"
  | "RETURNED_FROM_LUNCH"
  | "COMPLETED";

export interface AttendanceEvent {
  id: string;
  event_type: AttendanceEventType;
  event_date: string;
  scanned_at: string;
  scanned_at_ist: string;
  is_manually_corrected: boolean;
  verified_distance_meters?: number | null;
  reported_accuracy_meters?: number | null;
  verification_method?: "QR_GPS" | "MANUAL_ADMIN" | string | null;
}

export interface ScanLocationPayload {
  qr_token: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  location_timestamp?: string;
}

export interface OfficeLocationConfig {
  office_latitude: number;
  office_longitude: number;
  geofence_radius_meters: number;
  preferred_accuracy_meters: number;
  max_accuracy_meters: number;
  wifi_restriction_enabled: boolean;
}

export interface AttendanceStatusSummary {
  date: string;
  status: AttendanceStatus;
  next_expected_event: AttendanceEventType | null;
  events: AttendanceEvent[];
  is_completed: boolean;
}

export interface AuditLog {
  id: string;
  attendance_record_id?: string | null;
  actor_user_id: string;
  actor_name: string;
  action: string;
  reason: string;
  previous_state?: Record<string, any> | null;
  new_state: Record<string, any>;
  created_at: string;
}

export interface DailyMonitorStaffItem {
  user: {
    id: string;
    full_name: string;
    phone_number: string;
    role: string;
  };
  status: AttendanceStatus;
  next_expected_event: AttendanceEventType | null;
  is_completed: boolean;
  events: AttendanceEvent[];
}

export interface DailyMonitorResponse {
  date: string;
  counts: {
    total_staff: number;
    present: number;
    on_break: number;
    completed: number;
    not_started: number;
  };
  staff_attendance: DailyMonitorStaffItem[];
}

export interface OfflineAttendanceRecord {
  id: string; // unique offline correlation ID
  event_type: AttendanceEventType;
  qr_token?: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  scanned_at: string; // ISO string
  location_timestamp?: string;
  status: "PENDING" | "SYNCING" | "SYNCED" | "FAILED";
  error?: string;
  created_at: string;
}

export interface OfflineSyncItemPayload {
  offline_id: string;
  event_type: AttendanceEventType;
  qr_token?: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  scanned_at: string;
  location_timestamp?: string;
}

export interface OfflineSyncResultItem {
  offline_id: string;
  status: "SYNCED" | "ALREADY_EXISTS" | "REJECTED";
  message: string;
  event?: AttendanceEvent;
}

export interface OfflineSyncResponse {
  synced_count: number;
  already_exists_count: number;
  failed_count: number;
  results: OfflineSyncResultItem[];
}

