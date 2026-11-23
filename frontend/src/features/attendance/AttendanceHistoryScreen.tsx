import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { GlassCard } from "../../components/common/GlassCard";
import { Button } from "../../components/common/Button";
import { StatusBadge } from "../../components/common/Badge";
import { ScrollTimePicker } from "../../components/common/ScrollTimePicker";
import { IOSSegmentedSwitch, type SegmentOption } from "../../components/common/IOSSegmentedSwitch";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { attendanceAPI, adminAPI } from "../../services/api";
import type {
  AttendanceEvent,
  AttendanceEventType,
  UserSummary,
  DailyMonitorResponse,
  DailyMonitorStaffItem,
} from "../../types";
import {
  Calendar,
  Clock,
  RefreshCw,
  ArrowLeft,
  ShieldAlert,
  Users,
  User,
  Search,
  ChevronDown,
  ChevronRight,
  MapPin,
  Edit2,
  PlusCircle,
  KeyRound,
  Trash2,
  X,
  AlertTriangle,
  Eye,
  EyeOff,
  CheckCircle2,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

export const AttendanceHistoryScreen: React.FC = () => {
  const { isAdmin, isSuperAdmin } = useAuth();
  const { t, isMarathi } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const paramTab = searchParams.get("tab");
  const paramUserId = searchParams.get("userId");
  const paramDate = searchParams.get("date");

  const formatPhone = (phone?: string) => (phone || "").replace(/^\+91/, "");

  const parseIstTimeTo24h = (scannedAtIst?: string, scannedAtUtc?: string): string => {
    if (scannedAtIst) {
      const match = scannedAtIst.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = match[2];
        const meridiem = match[3].toUpperCase();
        if (meridiem === "PM" && hours < 12) hours += 12;
        if (meridiem === "AM" && hours === 12) hours = 0;
        return `${String(hours).padStart(2, "0")}:${minutes}`;
      }
    }
    if (scannedAtUtc) {
      try {
        const d = new Date(scannedAtUtc);
        if (!isNaN(d.getTime())) {
          return d.toLocaleTimeString("en-GB", {
            timeZone: "Asia/Kolkata",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
        }
      } catch {}
    }
    return "09:30";
  };

  const getStaffRoleName = (r: any): string => {
    if (!r) return "STAFF";
    if (typeof r === "object" && r?.name) return String(r.name);
    if (typeof r === "string") return String(r);
    return "STAFF";
  };

  // View Mode: 'my' for personal records, 'staff' for staff attendance records
  const [activeTab, setActiveTab] = useState<"my" | "staff">(() => {
    if (paramTab === "staff" || paramUserId) return "staff";
    return isSuperAdmin ? "staff" : "my";
  });

  // --- Personal Attendance State ---
  const [myRecords, setMyRecords] = useState<AttendanceEvent[]>([]);
  const [isLoadingMyHistory, setIsLoadingMyHistory] = useState(false);

  // --- Staff Roster & History State (for Admin / Super Admin) ---
  const [allStaffList, setAllStaffList] = useState<UserSummary[]>([]);
  const [monitorData, setMonitorData] = useState<DailyMonitorResponse | null>(null);
  const [isLoadingStaffData, setIsLoadingStaffData] = useState(false);
  const [expandedStaffId, setExpandedStaffId] = useState<string | null>(() => paramUserId || null);
  const [staffHistories, setStaffHistories] = useState<Record<string, AttendanceEvent[]>>({});
  const [loadingHistoryForId, setLoadingHistoryForId] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PRESENT" | "ON_BREAK" | "COMPLETED" | "NOT_STARTED">("ALL");

  // --- Modals State ---
  // Manual Add Modal
  const [manualAddStaff, setManualAddStaff] = useState<UserSummary | null>(null);
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [manualEventType, setManualEventType] = useState("OFFICE_IN");
  const [manualTime, setManualTime] = useState("09:30");
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // Event Correction Modal
  const [correctingEvent, setCorrectingEvent] = useState<{
    staff: UserSummary;
    event: AttendanceEvent;
  } | null>(null);
  const [correctionTime, setCorrectionTime] = useState("09:30");
  const [correctionEventType, setCorrectionEventType] = useState("OFFICE_IN");
  const [isSubmittingCorrection, setIsSubmittingCorrection] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  // Reset PIN Modal
  const [resetPinStaff, setResetPinStaff] = useState<UserSummary | null>(null);
  const [newStaffPin, setNewStaffPin] = useState("");
  const [confirmStaffPin, setConfirmStaffPin] = useState("");
  const [isSubmittingResetPin, setIsSubmittingResetPin] = useState(false);
  const [resetPinError, setResetPinError] = useState<string | null>(null);
  const [showNewStaffPin, setShowNewStaffPin] = useState(false);

  // Hold for 2.5s to show staff actions (Reset PIN or Delete Staff)
  const [staffActionTarget, setStaffActionTarget] = useState<UserSummary | null>(null);
  const [deletingStaff, setDeletingStaff] = useState<UserSummary | null>(null);
  const [isDeletingStaff, setIsDeletingStaff] = useState(false);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isLongPressedRef = useRef(false);

  // Date-wise collapsible entries
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>(() => {
    if (paramUserId && paramDate) {
      return { [`${paramUserId}_${paramDate}`]: true };
    }
    return {};
  });
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  const toggleDateExpand = (staffId: string, dateStr: string) => {
    const key = `${staffId}_${dateStr}`;
    setExpandedDates((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const cancelHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    touchStartPosRef.current = null;
  }, []);

  const startHold = useCallback(
    (staff: UserSummary) => {
      cancelHold();
      isLongPressedRef.current = false;

      const duration = 2500; // 2.5 seconds exact hold

      holdTimerRef.current = setTimeout(() => {
        isLongPressedRef.current = true;
        if (navigator.vibrate) {
          try {
            navigator.vibrate(80);
          } catch {}
        }
        setStaffActionTarget(staff);
        cancelHold();
      }, duration);
    },
    [cancelHold]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent, staff: UserSummary) => {
      // Clear any active native selection immediately
      if (window.getSelection) {
        window.getSelection()?.removeAllRanges();
      }
      const touch = e.touches[0];
      touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
      startHold(staff);
    },
    [startHold]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartPosRef.current) return;
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
      const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
      // Only cancel if real finger drag/scroll occurs (> 12px)
      if (dx > 12 || dy > 12) {
        cancelHold();
      }
    },
    [cancelHold]
  );

  // Feedback Notification Banner
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const showNotification = (msg: string, isError = false) => {
    if (isError) {
      setActionError(msg);
      setTimeout(() => setActionError(null), 4000);
    } else {
      setActionSuccess(msg);
      setTimeout(() => setActionSuccess(null), 4000);
    }
  };

  // Fetch Personal History
  const fetchMyHistory = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoadingMyHistory(true);
    try {
      const data = await attendanceAPI.getHistory();
      setMyRecords(data);
    } catch (err) {
      console.error("Failed to load personal history:", err);
    } finally {
      if (!isSilent) setIsLoadingMyHistory(false);
    }
  }, []);

  // Fetch Staff List & Daily Monitor
  const fetchStaffData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoadingStaffData(true);
    try {
      const [staffList, monitor] = await Promise.all([
        adminAPI.listStaff(),
        adminAPI.getDailyMonitor(),
      ]);
      setAllStaffList(staffList);
      setMonitorData(monitor);
    } catch (err) {
      console.error("Failed to load staff data:", err);
    } finally {
      if (!isSilent) setIsLoadingStaffData(false);
    }
  }, []);

  // Fetch individual staff history
  const staffHistoriesRef = useRef<Record<string, AttendanceEvent[]>>({});
  useEffect(() => {
    staffHistoriesRef.current = staffHistories;
  }, [staffHistories]);

  const fetchIndividualStaffHistory = useCallback(async (userId: string, force = false) => {
    if (!force && staffHistoriesRef.current[userId]) {
      return staffHistoriesRef.current[userId];
    }
    setLoadingHistoryForId(userId);
    try {
      const history = await adminAPI.getStaffHistory(userId);
      setStaffHistories((prev) => {
        const next = { ...prev, [userId]: history };
        staffHistoriesRef.current = next;
        return next;
      });
      return history;
    } catch (err) {
      console.error(`Failed to load history for user ${userId}:`, err);
      return [];
    } finally {
      setLoadingHistoryForId(null);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (paramTab === "staff" || paramUserId) {
      setActiveTab("staff");
      fetchStaffData();
      if (paramUserId) {
        setExpandedStaffId(paramUserId);
        fetchIndividualStaffHistory(paramUserId, true);
        if (paramDate) {
          setExpandedDates((prev) => ({
            ...prev,
            [`${paramUserId}_${paramDate}`]: true,
          }));
        }
      }
    } else if (isSuperAdmin) {
      setActiveTab("staff");
      fetchStaffData();
    } else if (isAdmin) {
      fetchMyHistory();
      fetchStaffData();
    } else {
      setActiveTab("my");
      fetchMyHistory();
    }
  }, [isAdmin, isSuperAdmin, paramTab, paramUserId, paramDate, fetchMyHistory, fetchStaffData, fetchIndividualStaffHistory]);

  // Smooth scroll to selected date or staff card once data is loaded
  const autoScrolledTargetRef = useRef<string | null>(null);
  useEffect(() => {
    if (paramUserId) {
      const targetKey = paramDate ? `${paramUserId}_${paramDate}` : paramUserId;
      if (autoScrolledTargetRef.current === targetKey) return;

      const timer = setTimeout(() => {
        const dateEl = paramDate ? document.getElementById(`date-card-${paramUserId}-${paramDate}`) : null;
        const staffEl = document.getElementById(`staff-card-${paramUserId}`);
        const el = dateEl || staffEl;
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          autoScrolledTargetRef.current = targetKey;
        }
      }, 450);

      return () => clearTimeout(timer);
    }
  }, [paramUserId, paramDate, staffHistories]);

  // Real-time automatic background polling & focus refresh (every 20s)
  useEffect(() => {
    const refreshLive = () => {
      if (document.visibilityState === "visible") {
        if (activeTab === "staff") {
          fetchStaffData(true);
          if (expandedStaffId) {
            fetchIndividualStaffHistory(expandedStaffId, true);
          }
        } else {
          fetchMyHistory(true);
        }
      }
    };

    const interval = setInterval(refreshLive, 20000);
    window.addEventListener("focus", refreshLive);
    document.addEventListener("visibilitychange", refreshLive);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refreshLive);
      document.removeEventListener("visibilitychange", refreshLive);
    };
  }, [activeTab, expandedStaffId, fetchStaffData, fetchMyHistory, fetchIndividualStaffHistory]);

  // Handle staff card expand toggle
  const toggleStaffExpand = async (staffId: string) => {
    if (expandedStaffId === staffId) {
      setExpandedStaffId(null);
    } else {
      setExpandedStaffId(staffId);
      if (!staffHistories[staffId]) {
        await fetchIndividualStaffHistory(staffId);
      }
    }
  };

  const getEventName = (eventType: AttendanceEventType | string): string => {
    switch (eventType) {
      case "OFFICE_IN":
        return t.officeIn;
      case "LUNCH_BREAK_OUT":
        return t.lunchBreakOut;
      case "LUNCH_BREAK_IN":
        return t.lunchBreakIn;
      case "OFFICE_OUT":
        return t.officeOut;
      case "ABSENT":
        return isMarathi ? "गैरहजर (Absent)" : "Absent";
      default:
        return String(eventType).replace(/_/g, " ");
    }
  };

  // Group an array of events by event_date
  const groupEventsByDate = (events: AttendanceEvent[]) => {
    return events.reduce<Record<string, AttendanceEvent[]>>((acc, record) => {
      if (!acc[record.event_date]) {
        acc[record.event_date] = [];
      }
      acc[record.event_date].push(record);
      return acc;
    }, {});
  };

  // Status mapping for staff
  const staffStatusMap = useMemo(() => {
    const map: Record<string, DailyMonitorStaffItem> = {};
    if (monitorData?.staff_attendance) {
      for (const item of monitorData.staff_attendance) {
        map[item.user.id] = item;
      }
    }
    return map;
  }, [monitorData]);

  // Filter staff list
  const filteredStaffList = useMemo(() => {
    return allStaffList.filter((staff) => {
      // Exclude Super Admin completely from attendance roster
      const roleName = getStaffRoleName(staff.role);
      if (roleName === "SUPER_ADMIN") return false;

      const matchesSearch =
        staff.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        staff.phone_number.includes(searchQuery);

      if (!matchesSearch) return false;

      if (statusFilter === "ALL") return true;

      const monitorItem = staffStatusMap[staff.id];
      const currentStatus = monitorItem?.status || "NOT_STARTED";

      if (statusFilter === "PRESENT") {
        return currentStatus === "CHECKED_IN" || currentStatus === "RETURNED_FROM_LUNCH";
      }
      if (statusFilter === "ON_BREAK") return currentStatus === "ON_LUNCH_BREAK";
      if (statusFilter === "COMPLETED") return currentStatus === "COMPLETED";
      if (statusFilter === "NOT_STARTED") return currentStatus === "NOT_STARTED";
      return true;
    });
  }, [allStaffList, searchQuery, statusFilter, staffStatusMap]);

  // --- Manual Add Submit ---
  const handleManualAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualAddStaff) return;
    setManualError(null);

    setIsSubmittingManual(true);
    try {
      const timestampIso = `${manualDate}T${manualTime}:00+05:30`;
      await adminAPI.manualAdd({
        user_id: manualAddStaff.id,
        event_type: manualEventType,
        event_date: manualDate,
        scanned_at: timestampIso,
        reason: "Manual adjustment by administrator",
      });
      showNotification(
        isMarathi
          ? `${manualAddStaff.full_name} यांच्यासाठी उपस्थिती नोंद जोडली गेली.`
          : `Record added for ${manualAddStaff.full_name}`
      );
      setManualAddStaff(null);
      // Refresh individual history
      await fetchIndividualStaffHistory(manualAddStaff.id, true);
    } catch (err: any) {
      setManualError(err.response?.data?.detail || "Failed to inject manual record.");
    } finally {
      setIsSubmittingManual(false);
    }
  };

  // --- Correction Submit ---
  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingEvent) return;
    setCorrectionError(null);

    setIsSubmittingCorrection(true);
    try {
      const eventDate = correctingEvent.event.event_date;
      const timestampIso = `${eventDate}T${correctionTime}:00+05:30`;

      await adminAPI.correct({
        record_id: correctingEvent.event.id,
        new_event_type: correctionEventType,
        new_scanned_at: timestampIso,
        reason: "Correction by administrator",
      });

      showNotification(t.correctSuccess);
      const staffId = correctingEvent.staff.id;
      setCorrectingEvent(null);
      // Refresh individual history
      await fetchIndividualStaffHistory(staffId, true);
    } catch (err: any) {
      setCorrectionError(err.response?.data?.detail || "Failed to update record.");
    } finally {
      setIsSubmittingCorrection(false);
    }
  };

  // --- Reset PIN Submit ---
  const handleResetPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPinStaff) return;
    setResetPinError(null);

    if (newStaffPin.length !== 6 || !/^\d{6}$/.test(newStaffPin)) {
      setResetPinError(t.pinLengthError);
      return;
    }
    if (newStaffPin !== confirmStaffPin) {
      setResetPinError(t.pinsDoNotMatch);
      return;
    }

    setIsSubmittingResetPin(true);
    try {
      await adminAPI.resetPin(resetPinStaff.id, newStaffPin, confirmStaffPin, "Administrative PIN reset");
      showNotification(
        isMarathi
          ? `${resetPinStaff.full_name} यांचा पिन यशस्वीरित्या रीसेट करण्यात आला.`
          : `PIN reset successfully for ${resetPinStaff.full_name}`
      );
      setResetPinStaff(null);
      setNewStaffPin("");
      setConfirmStaffPin("");
    } catch (err: any) {
      setResetPinError(err.response?.data?.detail || "Failed to reset PIN.");
    } finally {
      setIsSubmittingResetPin(false);
    }
  };

  // --- Delete Staff Submit ---
  const handleDeleteStaffConfirm = async () => {
    if (!deletingStaff) return;
    setIsDeletingStaff(true);
    try {
      await adminAPI.deleteStaff(deletingStaff.id);
      showNotification(
        isMarathi
          ? `${deletingStaff.full_name} यांचे खाते डेटाबेसमधून हटवले गेले.`
          : `Staff member ${deletingStaff.full_name} permanently deleted from database.`
      );
      setDeletingStaff(null);
      await fetchStaffData();
    } catch (err: any) {
      showNotification(err.response?.data?.detail || "Failed to delete staff member.", true);
    } finally {
      setIsDeletingStaff(false);
    }
  };

  const navTabOptions: SegmentOption<"my" | "staff">[] = [
    {
      value: "my",
      label: <span className="font-bold text-xs">{t.myAttendanceTab}</span>,
      icon: <User className="w-3.5 h-3.5" />,
    },
    {
      value: "staff",
      label: <span className="font-bold text-xs">{t.staffRecordsTab}</span>,
      icon: <Users className="w-3.5 h-3.5" />,
    },
  ];

  const myGroupedRecords = useMemo(() => groupEventsByDate(myRecords), [myRecords]);

  return (
    <div className="space-y-4">
      {/* Top Header Navigation */}
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={() => navigate(isSuperAdmin ? "/admin" : "/dashboard")}
          className="p-2 rounded-xl bg-white/50 border border-white/70 hover:bg-white text-brand-dark transition-all flex items-center gap-1.5 text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{isMarathi ? "मागे" : "Back"}</span>
        </button>

        <h2 className="text-sm sm:text-base font-bold text-brand-dark truncate max-w-[200px] text-center">
          {isSuperAdmin
            ? t.staffAttendanceRosterTitle
            : activeTab === "staff"
            ? t.staffRecordsTab
            : t.history}
        </h2>

        <button
          onClick={() => {
            if (activeTab === "staff") {
              fetchStaffData();
              if (expandedStaffId) fetchIndividualStaffHistory(expandedStaffId, true);
            } else {
              fetchMyHistory();
            }
          }}
          className="p-2 rounded-xl bg-white/50 border border-white/70 hover:bg-white text-brand-muted hover:text-brand-dark transition-all"
          title={isMarathi ? "माहिती रीफ्रेश करा" : "Refresh records"}
        >
          <RefreshCw
            className={`w-4 h-4 ${isLoadingMyHistory || isLoadingStaffData ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {/* Action Notification Banner */}
      {actionSuccess && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-fadeIn shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-800 text-xs font-semibold flex items-center gap-2 animate-fadeIn shadow-xs">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Admin Mode Switcher: My Attendance vs Staff Records */}
      {isAdmin && !isSuperAdmin && (
        <div className="pt-0.5">
          <IOSSegmentedSwitch<"my" | "staff">
            options={navTabOptions}
            value={activeTab}
            onChange={(val) => setActiveTab(val)}
            size="md"
            className="w-full"
          />
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION 1: PERSONAL ATTENDANCE HISTORY (Staff & Admin)    */}
      {/* ======================================================== */}
      {activeTab === "my" && !isSuperAdmin && (
        <div className="space-y-3">
          {isLoadingMyHistory ? (
            <div className="py-12 text-center text-xs text-brand-muted font-medium">
              Loading past records...
            </div>
          ) : myRecords.length === 0 ? (
            <GlassCard className="text-center py-10">
              <Clock className="w-10 h-10 text-brand-muted/50 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-brand-dark">No records found</h4>
              <p className="text-xs text-brand-muted mt-1">
                Your attendance scans will appear here chronologically.
              </p>
            </GlassCard>
          ) : (
            Object.entries(myGroupedRecords).map(([dateStr, dayEvents]) => (
              <GlassCard key={dateStr} className="!p-4 space-y-2.5">
                <div className="flex items-center justify-between border-b border-brand-dark/10 pb-2">
                  <span className="text-xs font-bold text-brand-dark flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-brand-primary" />
                    <span>
                      {new Date(dateStr).toLocaleDateString(isMarathi ? "mr-IN" : "en-IN", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </span>
                  <span className="text-[10px] font-semibold text-brand-muted">
                    {dayEvents.length} / 4 events
                  </span>
                </div>

                <div className="space-y-2">
                  {dayEvents.map((evt) => (
                    <div
                      key={evt.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-white/40 border border-white/60 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-brand-primary" />
                        <span className="font-semibold text-brand-dark">
                          {getEventName(evt.event_type)}
                        </span>
                        {evt.is_manually_corrected && (
                          <span
                            title="Manually adjusted by administrator"
                            className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-800 text-[9px] font-bold flex items-center gap-0.5"
                          >
                            <ShieldAlert className="w-2.5 h-2.5" />
                            <span>Corrected</span>
                          </span>
                        )}
                        {evt.verification_method === "QR_GPS" && evt.verified_distance_meters !== null && evt.verified_distance_meters !== undefined && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-800 font-semibold flex items-center gap-0.5">
                            <MapPin className="w-2.5 h-2.5 text-emerald-600" />
                            <span>{Math.round(evt.verified_distance_meters)}m</span>
                          </span>
                        )}
                      </div>
                      <span className="font-mono font-bold text-brand-muted">
                        {evt.scanned_at_ist}
                      </span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            ))
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION 2: STAFF ATTENDANCE RECORDS (Per-Staff Cards)    */}
      {/* ======================================================== */}
      {activeTab === "staff" && (isAdmin || isSuperAdmin) && (
        <div className="space-y-3">
          {/* Search & Filter Header */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-brand-muted" />
              <input
                type="text"
                placeholder={isMarathi ? "कर्मचारी नाव किंवा फोन नंबर शोधा..." : "Search staff by name or phone..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="glass-input !pl-9 text-xs"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {[
                { id: "ALL", label: t.filterAll },
                { id: "PRESENT", label: t.filterPresent },
                { id: "ON_BREAK", label: t.filterOnBreak },
                { id: "COMPLETED", label: t.filterCompleted },
                { id: "NOT_STARTED", label: t.filterNotStarted },
              ].map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setStatusFilter(pill.id as any)}
                  className={`px-3 py-1 rounded-full text-[11px] whitespace-nowrap transition-all duration-200 cursor-pointer ${
                    statusFilter === pill.id
                      ? "bg-white/90 text-brand-dark border-[1.5px] border-white shadow-[0_2px_8px_rgba(21,59,67,0.12),inset_0_1px_1.5px_rgba(255,255,255,1)] font-bold scale-[1.02]"
                      : "bg-white/40 text-brand-muted hover:text-brand-dark border border-white/60 font-medium"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          {/* Staff Count Label */}
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold text-brand-dark uppercase tracking-wider">
              {isMarathi ? "कर्मचारी यादी" : "Staff Directory"}
            </span>
            <span className="text-[11px] font-semibold text-brand-muted">
              {filteredStaffList.length} {isMarathi ? "कर्मचारी" : "staff"}
            </span>
          </div>

          {isLoadingStaffData ? (
            <div className="py-10 text-center text-xs text-brand-muted font-medium">
              Loading staff directory...
            </div>
          ) : filteredStaffList.length === 0 ? (
            <GlassCard className="text-center py-8 text-xs text-brand-muted">
              {isMarathi ? "कोणतेही कर्मचारी आढळले नाहीत." : "No registered staff found matching criteria."}
            </GlassCard>
          ) : (
            filteredStaffList.map((staff) => {
              const isExpanded = expandedStaffId === staff.id;
              const isSelectedStaff = paramUserId === staff.id;
              const monitorItem = staffStatusMap[staff.id];
              const currentStatus = monitorItem?.status || "NOT_STARTED";
              const staffRecords = staffHistories[staff.id] || [];
              const groupedStaffRecords = groupEventsByDate(staffRecords);

              // If navigated from Irregularities for a date where no punches exist (NOT_MARKED),
              // inject that date key so the card is rendered and admin can immediately record attendance.
              if (isSelectedStaff && paramDate && !groupedStaffRecords[paramDate]) {
                groupedStaffRecords[paramDate] = [];
              }

              const isLoadingHistory = loadingHistoryForId === staff.id;

              return (
                <GlassCard
                  key={staff.id}
                  id={`staff-card-${staff.id}`}
                  className={`!p-3.5 space-y-3 transition-all duration-200 border-white/80 relative overflow-hidden prevent-select ${
                    isSelectedStaff ? "ring-2 ring-brand-primary/50 shadow-md" : ""
                  }`}
                >
                  {/* Staff Card Header (Click to expand/collapse, Hold 2.5s for actions) */}
                  <div
                    onClick={() => {
                      if (isLongPressedRef.current) {
                        isLongPressedRef.current = false;
                        return;
                      }
                      toggleStaffExpand(staff.id);
                    }}
                    onMouseDown={() => startHold(staff)}
                    onMouseUp={cancelHold}
                    onMouseLeave={cancelHold}
                    onTouchStart={(e) => handleTouchStart(e, staff)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={cancelHold}
                    onTouchCancel={cancelHold}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      return false;
                    }}
                    style={{
                      WebkitTouchCallout: "none",
                      WebkitUserSelect: "none",
                      userSelect: "none",
                    }}
                    className="flex items-center justify-between cursor-pointer select-none group prevent-select"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 pointer-events-none">
                      <div className="w-9 h-9 rounded-xl bg-brand-primary/15 text-brand-dark flex items-center justify-center font-bold text-xs shrink-0 group-hover:scale-105 transition-transform">
                        {staff.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs sm:text-sm font-bold text-brand-dark truncate">
                            {staff.full_name}
                          </h4>
                          {getStaffRoleName(staff.role) === "ADMIN" && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-teal-500/20 text-teal-800 border border-teal-500/30">
                              ADMIN
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-brand-muted font-medium">
                          {formatPhone(staff.phone_number)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pointer-events-none">
                      <StatusBadge status={currentStatus} size="sm" />
                      <div
                        className={`p-1 rounded-lg bg-white/50 text-brand-muted group-hover:text-brand-dark transition-transform duration-200 ${
                          isExpanded ? "rotate-180 bg-white" : ""
                        }`}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  {/* Expanded Daily Entries Per Date Section */}
                  {isExpanded && (
                    <div className="pt-2 border-t border-brand-dark/10 space-y-3 animate-fadeIn">
                      {/* Action Bar for this Staff Member (Reset PIN removed, only Manual Adjust remains) */}
                      <div className="flex items-center justify-between gap-2 pt-1 pb-1">
                        <span className="text-[11px] font-bold text-brand-dark">
                          {isMarathi ? "दैनिक उपस्थिती नोंदी" : "Daily Attendance Logs"}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setManualAddStaff(staff);
                              setManualDate(paramDate || todayStr);
                              setManualError(null);
                            }}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-brand-primary/15 text-brand-dark hover:bg-brand-primary/25 transition-all flex items-center gap-1"
                            title="Add missing attendance scan"
                          >
                            <PlusCircle className="w-3 h-3 text-brand-primary" />
                            <span>{isMarathi ? "नोंद जोडा" : "Manual Adjust"}</span>
                          </button>
                        </div>
                      </div>

                      {/* Loading individual records */}
                      {isLoadingHistory ? (
                        <div className="py-6 text-center text-xs text-brand-muted font-medium flex items-center justify-center gap-2">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-primary" />
                          <span>Loading records for {staff.full_name}...</span>
                        </div>
                      ) : staffRecords.length === 0 && !paramDate ? (
                        <div className="py-6 text-center text-xs text-brand-muted bg-white/40 rounded-xl border border-white/60">
                          {isMarathi
                            ? "या कर्मचाऱ्यासाठी अद्याप कोणतीही उपस्थिती नोंद सापडली नाही."
                            : "No attendance records logged for this staff member yet."}
                        </div>
                      ) : (
                        /* Daily Entries Per Date Cards (Today open, target date open, past dates collapsible) */
                        <div className="space-y-2">
                          {Object.entries(groupedStaffRecords)
                            .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
                            .map(([dateStr, dayEvents]) => {
                              const isToday = dateStr === todayStr;
                              const isTargetDate = paramUserId === staff.id && paramDate === dateStr;
                              const isDateExpanded =
                                isToday || isTargetDate || (expandedDates[`${staff.id}_${dateStr}`] ?? false);
                              const isAbsent = dayEvents.some(
                                (e) => e.event_type === "ABSENT"
                              );
                              const hasCompleted = dayEvents.some(
                                (e) => e.event_type === "OFFICE_OUT"
                              );

                              return (
                                <div
                                  key={dateStr}
                                  id={`date-card-${staff.id}-${dateStr}`}
                                  className={`rounded-xl border shadow-xs overflow-hidden transition-all ${
                                    isTargetDate
                                      ? "bg-brand-primary/10 border-brand-primary ring-2 ring-brand-primary/40 shadow-md"
                                      : "bg-white/70 border-white"
                                  }`}
                                >
                                  {/* Date Card Header (Clickable for past dates) */}
                                  <div
                                    onClick={() => {
                                      if (!isToday && !isTargetDate) {
                                        toggleDateExpand(staff.id, dateStr);
                                      }
                                    }}
                                    className={`p-2.5 flex items-center justify-between transition-colors ${
                                      !isToday && !isTargetDate
                                        ? "cursor-pointer hover:bg-white/90"
                                        : isTargetDate
                                        ? "bg-brand-primary/15"
                                        : "bg-brand-primary/5"
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <Calendar className="w-3.5 h-3.5 text-brand-primary shrink-0" />
                                      <span className="text-xs font-bold text-brand-dark truncate">
                                        {new Date(dateStr).toLocaleDateString(
                                          isMarathi ? "mr-IN" : "en-IN",
                                          {
                                            weekday: "short",
                                            day: "numeric",
                                            month: "short",
                                            year: "numeric",
                                          }
                                        )}
                                      </span>
                                      {isToday && (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-brand-primary/15 text-brand-dark border border-brand-primary/25 shrink-0">
                                          {isMarathi ? "आज" : "Today"}
                                        </span>
                                      )}
                                      {isTargetDate && (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-brand-primary text-white shrink-0 animate-pulse">
                                          {isMarathi ? "अनियमितता तारीख" : "Selected Date"}
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span
                                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                          dayEvents.length === 0 || isAbsent
                                            ? "bg-rose-500/15 text-rose-800 border border-rose-500/30"
                                            : hasCompleted
                                            ? "bg-emerald-500/15 text-emerald-800 border border-emerald-500/30"
                                            : "bg-amber-500/15 text-amber-800 border border-amber-500/30"
                                        }`}
                                      >
                                        {dayEvents.length === 0 || isAbsent
                                          ? isMarathi
                                            ? "गैरहजर"
                                            : "Absent"
                                          : hasCompleted
                                          ? isMarathi
                                            ? "पूर्ण"
                                            : "Completed"
                                          : isMarathi
                                          ? "अपूर्ण"
                                          : "Incomplete"}
                                      </span>
                                      <span className="text-[10px] font-semibold text-brand-muted">
                                        {isAbsent ? "0/4" : `${dayEvents.length}/4`}
                                      </span>
                                      {!isToday && !isTargetDate && (
                                        <div className="p-0.5 text-brand-muted">
                                          {isDateExpanded ? (
                                            <ChevronDown className="w-3.5 h-3.5" />
                                          ) : (
                                            <ChevronRight className="w-3.5 h-3.5" />
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Event Timeline for Date (Visible if expanded or today or target date) */}
                                  {isDateExpanded && (
                                    <div className="p-2.5 pt-1 space-y-1.5 border-t border-brand-dark/5 bg-white/40">
                                      {dayEvents.length === 0 ? (
                                        <div className="p-3 text-center rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs space-y-2">
                                          <div className="flex items-center justify-center gap-1.5 text-rose-800 font-bold">
                                            <AlertTriangle className="w-4 h-4 text-rose-600" />
                                            <span>
                                              {isMarathi
                                                ? "या दिवशी कोणतीही हजेरी नोंद नाही (गैरहजर)"
                                                : "No punches recorded for this date (Absent)"}
                                            </span>
                                          </div>
                                          <p className="text-[11px] text-rose-700/80">
                                            {isMarathi
                                              ? "या कर्मचाऱ्याची या दिवशी कोणतीही उपस्थिती नोंद नाही. आपण मॅन्युअली उपस्थिती नोंदवू शकता."
                                              : "No punches found for this staff member on this date. You can manually record attendance."}
                                          </p>
                                          <Button
                                            variant="primary"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setManualAddStaff(staff);
                                              setManualDate(dateStr);
                                              setManualEventType("OFFICE_IN");
                                              setManualTime("10:00");
                                              setManualError(null);
                                            }}
                                            className="!py-1.5 !px-3 text-xs font-bold mx-auto"
                                            icon={<PlusCircle className="w-3.5 h-3.5" />}
                                          >
                                            {isMarathi ? "हजेरी नोंदवा (Office In)" : "Record Attendance (Office In)"}
                                          </Button>
                                        </div>
                                      ) : (
                                        <div className="space-y-1.5">
                                          {dayEvents.map((evt) => (
                                            <div
                                              key={evt.id}
                                              className="flex items-center justify-between p-2 rounded-lg bg-white/80 border border-white text-xs hover:border-brand-primary/40 transition-colors"
                                            >
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                {evt.event_type === "ABSENT" ? (
                                                  <span className="font-bold text-rose-700 flex items-center gap-1">
                                                    <AlertTriangle className="w-3 h-3 text-rose-600" />
                                                    {getEventName(evt.event_type)}
                                                  </span>
                                                ) : (
                                                  <span className="font-bold text-brand-dark">
                                                    {getEventName(evt.event_type)}
                                                  </span>
                                                )}
                                                <span className="text-brand-muted font-medium">
                                                  {evt.scanned_at_ist}
                                                </span>
                                                {evt.verification_method === "QR_GPS" && (
                                                  <span
                                                    className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-800 font-semibold flex items-center gap-0.5"
                                                    title="Physical GPS Geofence Verified"
                                                  >
                                                    <MapPin className="w-2.5 h-2.5 text-emerald-600" />
                                                    {evt.verified_distance_meters !== null &&
                                                    evt.verified_distance_meters !== undefined
                                                      ? `${Math.round(evt.verified_distance_meters)}m`
                                                      : "GPS"}
                                                  </span>
                                                )}
                                                {evt.verification_method === "MANUAL_ADMIN" && (
                                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-800 font-semibold flex items-center gap-0.5">
                                                    <ShieldAlert className="w-2.5 h-2.5 text-purple-600" />
                                                    Manual
                                                  </span>
                                                )}
                                                {evt.is_manually_corrected && (
                                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-800 font-semibold">
                                                    Corrected
                                                  </span>
                                                )}
                                              </div>

                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setCorrectingEvent({ staff, event: evt });
                                                  setCorrectionEventType(evt.event_type);
                                                  setCorrectionTime(
                                                    parseIstTimeTo24h(evt.scanned_at_ist, evt.scanned_at)
                                                  );
                                                  setCorrectionError(null);
                                                }}
                                                className="p-1.5 rounded-md bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-dark transition-all"
                                                title={t.editRecord}
                                              >
                                                <Edit2 className="w-3 h-3 text-brand-primary" />
                                              </button>
                                            </div>
                                          ))}

                                          {!hasCompleted && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setManualAddStaff(staff);
                                                setManualDate(dateStr);
                                                const hasIn = dayEvents.some((ev) => ev.event_type === "OFFICE_IN");
                                                const hasLunchOut = dayEvents.some(
                                                  (ev) => ev.event_type === "LUNCH_BREAK_OUT"
                                                );
                                                const hasLunchIn = dayEvents.some(
                                                  (ev) => ev.event_type === "LUNCH_BREAK_IN"
                                                );
                                                const hasOut = dayEvents.some(
                                                  (ev) => ev.event_type === "OFFICE_OUT"
                                                );
                                                let nextEvt = "OFFICE_OUT";
                                                let defaultTime = "18:00";
                                                if (!hasIn) {
                                                  nextEvt = "OFFICE_IN";
                                                  defaultTime = "10:00";
                                                } else if (hasLunchOut && !hasLunchIn) {
                                                  nextEvt = "LUNCH_BREAK_IN";
                                                  defaultTime = "14:00";
                                                } else if (!hasOut) {
                                                  nextEvt = "OFFICE_OUT";
                                                  defaultTime = "18:00";
                                                }
                                                setManualEventType(nextEvt);
                                                setManualTime(defaultTime);
                                                setManualError(null);
                                              }}
                                              className="w-full py-1.5 px-2 text-[11px] font-semibold rounded-lg bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-dark transition-all flex items-center justify-center gap-1 border border-brand-primary/25 mt-2"
                                            >
                                              <PlusCircle className="w-3.5 h-3.5 text-brand-primary" />
                                              <span>
                                                {isMarathi
                                                  ? "या दिवसासाठी उर्वरित नोंद जोडा"
                                                  : "Add Missing Punch for this Date"}
                                              </span>
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  )}
                </GlassCard>
              );
            })
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 1: MANUAL ADD ATTENDANCE SCAN                      */}
      {/* ======================================================== */}
      {manualAddStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/40 backdrop-blur-sm animate-fadeIn">
          <GlassCard className="w-full max-w-sm relative !p-6 border-white/80 shadow-2xl">
            <button
              onClick={() => setManualAddStaff(null)}
              className="absolute right-4 top-4 p-1.5 rounded-full hover:bg-black/5 text-brand-muted hover:text-brand-dark transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-base font-bold text-brand-dark mb-1">
              {isMarathi ? "उपस्थिती नोंद मॅन्युअल प्रविष्ट करा" : "Manual Attendance Adjustment"}
            </h3>
            <p className="text-xs text-brand-muted mb-4">
              Staff: <span className="font-bold text-brand-dark">{manualAddStaff.full_name}</span> ({formatPhone(manualAddStaff.phone_number)})
            </p>

            {manualError && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 text-xs font-medium">
                {manualError}
              </div>
            )}

            <form onSubmit={handleManualAddSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-brand-dark mb-1">
                  {isMarathi ? "तारीख" : "Date"}
                </label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="glass-input text-xs font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-dark mb-1">
                  {isMarathi ? "नोंदीचा प्रकार" : "Event Type"}
                </label>
                <select
                  value={manualEventType}
                  onChange={(e) => setManualEventType(e.target.value)}
                  className="glass-input text-xs font-medium"
                >
                  <option value="OFFICE_IN">Office In</option>
                  <option value="LUNCH_BREAK_OUT">Lunch Break Out</option>
                  <option value="LUNCH_BREAK_IN">Lunch Break In</option>
                  <option value="OFFICE_OUT">Office Out</option>
                </select>
              </div>

              <ScrollTimePicker
                value={manualTime}
                onChange={setManualTime}
                label={isMarathi ? "उपस्थिती वेळ निवडा (घड्याळ)" : "Select Attendance Time"}
                isMarathi={isMarathi}
              />

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setManualAddStaff(null)}
                  className="flex-1 text-xs !py-2.5"
                >
                  {t.cancel}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isSubmittingManual}
                  className="flex-1 text-xs !py-2.5 font-bold"
                >
                  {isMarathi ? "नोंद जतन करा" : "Save Record"}
                </Button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: CORRECT EXISTING ATTENDANCE RECORD             */}
      {/* ======================================================== */}
      {correctingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/40 backdrop-blur-sm animate-fadeIn">
          <GlassCard className="w-full max-w-sm relative !p-6 border-white/80 shadow-2xl">
            <button
              onClick={() => setCorrectingEvent(null)}
              className="absolute right-4 top-4 p-1.5 rounded-full hover:bg-black/5 text-brand-muted hover:text-brand-dark transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-base font-bold text-brand-dark mb-1">
              {t.editRecord}
            </h3>
            <p className="text-xs text-brand-muted mb-4">
              Staff: <span className="font-bold text-brand-dark">{correctingEvent.staff.full_name}</span>
              <br />
              Current: <span className="font-semibold">{correctingEvent.event.event_type}</span> at{" "}
              {correctingEvent.event.scanned_at_ist} ({correctingEvent.event.event_date})
            </p>

            {correctionError && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 text-xs font-medium">
                {correctionError}
              </div>
            )}

            <form onSubmit={handleCorrectionSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-brand-dark mb-1">
                  {t.newEvent}
                </label>
                <select
                  value={correctionEventType}
                  onChange={(e) => setCorrectionEventType(e.target.value)}
                  className="glass-input text-xs font-medium"
                >
                  <option value="OFFICE_IN">Office In</option>
                  <option value="LUNCH_BREAK_OUT">Lunch Break Out</option>
                  <option value="LUNCH_BREAK_IN">Lunch Break In</option>
                  <option value="OFFICE_OUT">Office Out</option>
                </select>
              </div>

              <ScrollTimePicker
                value={correctionTime}
                onChange={setCorrectionTime}
                label={isMarathi ? "दुरुस्त वेळ निवडा (घड्याळ)" : "Select Corrected Time"}
                isMarathi={isMarathi}
              />

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setCorrectingEvent(null)}
                  className="flex-1 text-xs !py-2.5"
                >
                  {t.cancel}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isSubmittingCorrection}
                  className="flex-1 text-xs !py-2.5 font-bold"
                >
                  {isMarathi ? "दुरुस्ती जतन करा" : "Save Correction"}
                </Button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: RESET STAFF PIN                                */}
      {/* ======================================================== */}
      {resetPinStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/40 backdrop-blur-sm animate-fadeIn">
          <GlassCard className="w-full max-w-sm relative !p-6 border-white/80 shadow-2xl">
            <button
              onClick={() => setResetPinStaff(null)}
              className="absolute right-4 top-4 p-1.5 rounded-full hover:bg-black/5 text-brand-muted hover:text-brand-dark transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-base font-bold text-brand-dark mb-1 flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-amber-700" />
              <span>{t.resetPinTitle}</span>
            </h3>
            <p className="text-xs text-brand-muted mb-4">
              Staff: <span className="font-bold text-brand-dark">{resetPinStaff.full_name}</span> ({formatPhone(resetPinStaff.phone_number)})
            </p>

            {resetPinError && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 text-xs font-medium">
                {resetPinError}
              </div>
            )}

            <form onSubmit={handleResetPinSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-brand-dark mb-1">
                  {t.newPin}
                </label>
                <div className="relative">
                  <input
                    type={showNewStaffPin ? "text" : "password"}
                    maxLength={6}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="••••••"
                    value={newStaffPin}
                    onChange={(e) => setNewStaffPin(e.target.value.replace(/\D/g, ""))}
                    className="glass-input pr-10 text-sm font-bold tracking-widest"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewStaffPin(!showNewStaffPin)}
                    className="absolute right-3 top-3 text-brand-muted hover:text-brand-dark"
                  >
                    {showNewStaffPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-dark mb-1">
                  {t.confirmPin}
                </label>
                <input
                  type={showNewStaffPin ? "text" : "password"}
                  maxLength={6}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="••••••"
                  value={confirmStaffPin}
                  onChange={(e) => setConfirmStaffPin(e.target.value.replace(/\D/g, ""))}
                  className="glass-input text-sm font-bold tracking-widest"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setResetPinStaff(null)}
                  className="flex-1 text-xs !py-2.5"
                >
                  {t.cancel}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isSubmittingResetPin}
                  className="flex-1 text-xs !py-2.5 font-bold"
                >
                  {t.resetPinButton}
                </Button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 4: STAFF ACTION MENU (Triggered by 2.5s Hold)       */}
      {/* ======================================================== */}
      {staffActionTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-sm"
          onClick={() => setStaffActionTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm relative p-5 bg-white/95 rounded-2xl border border-white shadow-2xl space-y-4"
          >
            <button
              onClick={() => setStaffActionTarget(null)}
              className="absolute right-4 top-4 p-1.5 rounded-full hover:bg-black/5 text-brand-muted hover:text-brand-dark transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="text-center pt-1 pb-1">
              <div className="w-12 h-12 rounded-2xl bg-brand-primary/20 text-brand-dark flex items-center justify-center font-bold text-lg mx-auto mb-2 shadow-xs">
                {(staffActionTarget.full_name?.charAt(0) || "S").toUpperCase()}
              </div>
              <h3 className="text-base font-bold text-brand-dark">
                {staffActionTarget.full_name}
              </h3>
              <div className="flex items-center justify-center gap-1.5 mt-0.5">
                <span className="text-xs text-brand-muted font-medium">
                  {formatPhone(staffActionTarget.phone_number)}
                </span>
                {getStaffRoleName(staffActionTarget.role) === "ADMIN" && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-teal-500/20 text-teal-800 border border-teal-500/30">
                    ADMIN
                  </span>
                )}
              </div>
              <p className="text-[11px] text-brand-muted mt-1 font-semibold">
                {isMarathi ? "कृपया पर्याय निवडा" : "Select an action below"}
              </p>
            </div>

            {/* Two Distinct Cards */}
            <div className="space-y-3">
              {/* Card 1: Reset PIN */}
              <button
                type="button"
                onClick={() => {
                  const target = staffActionTarget;
                  setStaffActionTarget(null);
                  setResetPinStaff(target);
                  setResetPinError(null);
                  setNewStaffPin("");
                  setConfirmStaffPin("");
                }}
                className="w-full p-4 rounded-xl bg-amber-50 hover:bg-amber-100/70 border border-amber-300 text-amber-950 font-bold text-xs flex items-center justify-between transition-all shadow-xs active:scale-[0.99] group text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-800 flex items-center justify-center shrink-0">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-amber-950">{t.resetPinButton}</div>
                    <div className="text-[11px] text-amber-800 font-normal mt-0.5">
                      {isMarathi ? "कर्मचाऱ्याचा ६-अंकी लॉगिन पिन बदला" : "Set new 6-digit login PIN"}
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-amber-700 shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </button>

              {/* Card 2: Delete Staff */}
              <button
                type="button"
                onClick={() => {
                  const target = staffActionTarget;
                  setStaffActionTarget(null);
                  setDeletingStaff(target);
                }}
                className="w-full p-4 rounded-xl bg-red-50 hover:bg-red-100/70 border border-red-300 text-red-950 font-bold text-xs flex items-center justify-between transition-all shadow-xs active:scale-[0.99] group text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-700 flex items-center justify-center shrink-0">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-red-950">{t.deleteStaff}</div>
                    <div className="text-[11px] text-red-800 font-normal mt-0.5">
                      {isMarathi ? "कर्मचारी व सर्व नोंदी कायमच्या हटवा" : "Permanently remove from database"}
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-red-700 shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            <div className="pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStaffActionTarget(null)}
                className="w-full text-xs !py-2.5"
              >
                {t.cancel}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 5: DELETE STAFF WARNING DIALOGUE                   */}
      {/* ======================================================== */}
      {deletingStaff && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
          onClick={() => !isDeletingStaff && setDeletingStaff(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm relative p-6 bg-white/95 rounded-2xl border border-red-300 shadow-2xl space-y-4"
          >
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2.5 rounded-xl bg-red-500/15 shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-brand-dark">
                  {t.deleteStaff}
                </h3>
                <span className="text-[11px] font-bold text-red-600 uppercase tracking-wide">
                  {isMarathi ? "चेतावणी / कायमस्वरूपी कृती" : "Warning / Permanent Action"}
                </span>
              </div>
            </div>

            <p className="text-xs text-brand-dark leading-relaxed font-medium">
              {isMarathi
                ? `तुम्हाला खात्री आहे का? तुम्ही "${deletingStaff.full_name}" (${formatPhone(deletingStaff.phone_number)}) यांचे खाते आणि त्यांच्या सर्व उपस्थिती नोंदी डेटाबेसमधून कायमच्या हटवत आहात. ही कृती पूर्ववत केली जाऊ शकत नाही.`
                : `Are you sure? You are about to permanently delete "${deletingStaff.full_name}" (${formatPhone(deletingStaff.phone_number)}) and all their attendance records from the database. This action cannot be undone.`}
            </p>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                disabled={isDeletingStaff}
                onClick={() => setDeletingStaff(null)}
                className="flex-1 text-xs !py-2.5"
              >
                {t.cancel}
              </Button>
              <button
                type="button"
                disabled={isDeletingStaff}
                onClick={handleDeleteStaffConfirm}
                className="flex-1 text-xs py-2.5 font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-md disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
              >
                {isDeletingStaff ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>{isMarathi ? "होय, हटवा" : "Yes, Delete"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
