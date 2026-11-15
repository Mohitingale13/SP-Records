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
import { useNavigate } from "react-router-dom";

export const AttendanceHistoryScreen: React.FC = () => {
  const { isAdmin, isSuperAdmin } = useAuth();
  const { t, isMarathi } = useLanguage();
  const navigate = useNavigate();

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

  // View Mode: 'my' for personal records, 'staff' for staff attendance records
  const [activeTab, setActiveTab] = useState<"my" | "staff">(() => {
    return isSuperAdmin ? "staff" : "my";
  });

  // --- Personal Attendance State ---
  const [myRecords, setMyRecords] = useState<AttendanceEvent[]>([]);
  const [isLoadingMyHistory, setIsLoadingMyHistory] = useState(false);

  // --- Staff Roster & History State (for Admin / Super Admin) ---
  const [allStaffList, setAllStaffList] = useState<UserSummary[]>([]);
  const [monitorData, setMonitorData] = useState<DailyMonitorResponse | null>(null);
  const [isLoadingStaffData, setIsLoadingStaffData] = useState(false);
  const [expandedStaffId, setExpandedStaffId] = useState<string | null>(null);
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
  const [manualReason, setManualReason] = useState("");
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // Event Correction Modal
  const [correctingEvent, setCorrectingEvent] = useState<{
    staff: UserSummary;
    event: AttendanceEvent;
  } | null>(null);
  const [correctionTime, setCorrectionTime] = useState("09:30");
  const [correctionEventType, setCorrectionEventType] = useState("OFFICE_IN");
  const [correctionReason, setCorrectionReason] = useState("");
  const [isSubmittingCorrection, setIsSubmittingCorrection] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  // Reset PIN Modal
  const [resetPinStaff, setResetPinStaff] = useState<UserSummary | null>(null);
  const [newStaffPin, setNewStaffPin] = useState("");
  const [confirmStaffPin, setConfirmStaffPin] = useState("");
  const [resetPinReason, setResetPinReason] = useState("");
  const [isSubmittingResetPin, setIsSubmittingResetPin] = useState(false);
  const [resetPinError, setResetPinError] = useState<string | null>(null);
  const [showNewStaffPin, setShowNewStaffPin] = useState(false);

  // Hold for 3s to show staff actions (Reset PIN or Delete Staff)
  const [holdStaffId, setHoldStaffId] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [staffActionTarget, setStaffActionTarget] = useState<UserSummary | null>(null);
  const [deletingStaff, setDeletingStaff] = useState<UserSummary | null>(null);
  const [isDeletingStaff, setIsDeletingStaff] = useState(false);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressedRef = useRef(false);

  // Date-wise collapsible entries
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
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
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    setHoldStaffId(null);
    setHoldProgress(0);
  }, []);

  const startHold = useCallback(
    (staff: UserSummary) => {
      cancelHold();
      isLongPressedRef.current = false;
      setHoldStaffId(staff.id);
      setHoldProgress(0);

      const startTime = Date.now();
      const duration = 3000;

      holdIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min((elapsed / duration) * 100, 100);
        setHoldProgress(progress);
      }, 40);

      holdTimerRef.current = setTimeout(() => {
        isLongPressedRef.current = true;
        cancelHold();
        if (navigator.vibrate) {
          try {
            navigator.vibrate(60);
          } catch {}
        }
        setStaffActionTarget(staff);
      }, duration);
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
  const fetchIndividualStaffHistory = useCallback(async (userId: string, force = false) => {
    if (!force && staffHistories[userId]) {
      return staffHistories[userId];
    }
    setLoadingHistoryForId(userId);
    try {
      const history = await adminAPI.getStaffHistory(userId);
      setStaffHistories((prev) => ({ ...prev, [userId]: history }));
      return history;
    } catch (err) {
      console.error(`Failed to load history for user ${userId}:`, err);
      return [];
    } finally {
      setLoadingHistoryForId(null);
    }
  }, [staffHistories]);

  // Initial load
  useEffect(() => {
    if (isSuperAdmin) {
      setActiveTab("staff");
      fetchStaffData();
    } else if (isAdmin) {
      fetchMyHistory();
      fetchStaffData();
    } else {
      setActiveTab("my");
      fetchMyHistory();
    }
  }, [isAdmin, isSuperAdmin, fetchMyHistory, fetchStaffData]);

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
      const r = staff.role as any;
      const roleName = (typeof r === "object" && r?.name) ? r.name : (r || "");
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

    if (!manualReason || manualReason.trim().length < 5) {
      setManualError(isMarathi ? "कृपया नोंदीचे स्पष्ट कारण प्रविष्ट करा." : "Please provide a clear written reason for manual adjustment.");
      return;
    }

    setIsSubmittingManual(true);
    try {
      const timestampIso = `${manualDate}T${manualTime}:00+05:30`;
      await adminAPI.manualAdd({
        user_id: manualAddStaff.id,
        event_type: manualEventType,
        event_date: manualDate,
        scanned_at: timestampIso,
        reason: manualReason.trim(),
      });
      showNotification(
        isMarathi
          ? `${manualAddStaff.full_name} यांच्यासाठी उपस्थिती नोंद जोडली गेली.`
          : `Record added for ${manualAddStaff.full_name}`
      );
      setManualAddStaff(null);
      setManualReason("");
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

    if (!correctionReason || correctionReason.trim().length < 5) {
      setCorrectionError(isMarathi ? "कृपया दुरुस्तीचे ठोस कारण प्रविष्ट करा." : "Please provide a clear written justification for correcting this timestamp.");
      return;
    }

    setIsSubmittingCorrection(true);
    try {
      const eventDate = correctingEvent.event.event_date;
      const timestampIso = `${eventDate}T${correctionTime}:00+05:30`;

      await adminAPI.correct({
        record_id: correctingEvent.event.id,
        new_event_type: correctionEventType,
        new_scanned_at: timestampIso,
        reason: correctionReason.trim(),
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
    if (!resetPinReason || resetPinReason.trim().length < 4) {
      setResetPinError("Please provide a valid administrative reason.");
      return;
    }

    setIsSubmittingResetPin(true);
    try {
      await adminAPI.resetPin(resetPinStaff.id, newStaffPin, confirmStaffPin, resetPinReason.trim());
      showNotification(
        isMarathi
          ? `${resetPinStaff.full_name} यांचा पिन यशस्वीरित्या रीसेट करण्यात आला.`
          : `PIN reset successfully for ${resetPinStaff.full_name}`
      );
      setResetPinStaff(null);
      setNewStaffPin("");
      setConfirmStaffPin("");
      setResetPinReason("");
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
              const monitorItem = staffStatusMap[staff.id];
              const currentStatus = monitorItem?.status || "NOT_STARTED";
              const staffRecords = staffHistories[staff.id] || [];
              const groupedStaffRecords = groupEventsByDate(staffRecords);
              const isLoadingHistory = loadingHistoryForId === staff.id;

              return (
                <GlassCard
                  key={staff.id}
                  className="!p-3.5 space-y-3 transition-all duration-200 border-white/80 relative overflow-hidden"
                >
                  {/* Visual hold progress indicator bar */}
                  {holdStaffId === staff.id && holdProgress > 0 && (
                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-brand-primary/20 z-10">
                      <div
                        className="h-full bg-brand-primary transition-all duration-75"
                        style={{ width: `${holdProgress}%` }}
                      />
                    </div>
                  )}

                  {/* Staff Card Header (Click to expand/collapse, Hold 3s for actions) */}
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
                    onTouchStart={() => startHold(staff)}
                    onTouchEnd={cancelHold}
                    onTouchCancel={cancelHold}
                    onTouchMove={cancelHold}
                    onContextMenu={(e) => e.preventDefault()}
                    className="flex items-center justify-between cursor-pointer select-none group"
                    title={isMarathi ? "३ सेकंद दाबून धरा: पिन बदला किंवा कर्मचारी हटवा" : "Hold for 3s to Reset PIN or Delete Staff"}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-xl bg-brand-primary/15 text-brand-dark flex items-center justify-center font-bold text-xs shrink-0 group-hover:scale-105 transition-transform">
                        {staff.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs sm:text-sm font-bold text-brand-dark truncate">
                            {staff.full_name}
                          </h4>
                          {staff.role === "ADMIN" && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-teal-500/20 text-teal-800 border border-teal-500/30">
                              ADMIN
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] text-brand-muted font-medium">
                            {formatPhone(staff.phone_number)}
                          </span>
                          <span className="text-[10px] text-brand-muted/70 italic">
                            • {isMarathi ? "३ से. धरा" : "3s hold"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
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
                              setManualError(null);
                              setManualReason("");
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
                      ) : staffRecords.length === 0 ? (
                        <div className="py-6 text-center text-xs text-brand-muted bg-white/40 rounded-xl border border-white/60">
                          {isMarathi
                            ? "या कर्मचाऱ्यासाठी अद्याप कोणतीही उपस्थिती नोंद सापडली नाही."
                            : "No attendance records logged for this staff member yet."}
                        </div>
                      ) : (
                        /* Daily Entries Per Date Cards (Today open, past dates collapsible) */
                        <div className="space-y-2">
                          {Object.entries(groupedStaffRecords)
                            .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
                            .map(([dateStr, dayEvents]) => {
                              const isToday = dateStr === todayStr;
                              const isDateExpanded =
                                isToday || (expandedDates[`${staff.id}_${dateStr}`] ?? false);
                              const hasCompleted = dayEvents.some(
                                (e) => e.event_type === "OFFICE_OUT"
                              );

                              return (
                                <div
                                  key={dateStr}
                                  className="rounded-xl bg-white/70 border border-white shadow-xs overflow-hidden transition-all"
                                >
                                  {/* Date Card Header (Clickable for past dates) */}
                                  <div
                                    onClick={() => {
                                      if (!isToday) {
                                        toggleDateExpand(staff.id, dateStr);
                                      }
                                    }}
                                    className={`p-2.5 flex items-center justify-between transition-colors ${
                                      !isToday ? "cursor-pointer hover:bg-white/90" : "bg-brand-primary/5"
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
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span
                                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                          hasCompleted
                                            ? "bg-emerald-500/15 text-emerald-800 border border-emerald-500/30"
                                            : "bg-amber-500/15 text-amber-800 border border-amber-500/30"
                                        }`}
                                      >
                                        {hasCompleted
                                          ? isMarathi
                                            ? "पूर्ण"
                                            : "Completed"
                                          : isMarathi
                                          ? "अपूर्ण"
                                          : "Incomplete"}
                                      </span>
                                      <span className="text-[10px] font-semibold text-brand-muted">
                                        {dayEvents.length}/4
                                      </span>
                                      {!isToday && (
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

                                  {/* Event Timeline for Date (Visible if expanded or today) */}
                                  {isDateExpanded && (
                                    <div className="p-2.5 pt-1 space-y-1.5 border-t border-brand-dark/5 bg-white/40">
                                      {dayEvents.map((evt) => (
                                        <div
                                          key={evt.id}
                                          className="flex items-center justify-between p-2 rounded-lg bg-white/80 border border-white text-xs hover:border-brand-primary/40 transition-colors"
                                        >
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-bold text-brand-dark">
                                              {getEventName(evt.event_type)}
                                            </span>
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
                                              setCorrectionTime(parseIstTimeTo24h(evt.scanned_at_ist, evt.scanned_at));
                                              setCorrectionReason("");
                                              setCorrectionError(null);
                                            }}
                                            className="p-1.5 rounded-md bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-dark transition-all"
                                            title={t.editRecord}
                                          >
                                            <Edit2 className="w-3 h-3 text-brand-primary" />
                                          </button>
                                        </div>
                                      ))}
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

              <div>
                <label className="block text-xs font-semibold text-brand-dark mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>{isMarathi ? "नोंदीचे कारण (अनिवार्य)" : "Mandatory Written Reason"}</span>
                </label>
                <textarea
                  rows={3}
                  placeholder={isMarathi ? "उदा. फोन बिघाड, काउंटर गर्दी, अधिकृत कामासाठी बाहेर..." : "Reason for manual entry (e.g. phone camera issue, approved field work)..."}
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  className="glass-input text-xs"
                  required
                />
              </div>

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

              <div>
                <label className="block text-xs font-semibold text-brand-dark mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>{isMarathi ? "दुरुस्तीचे कारण (अनिवार्य)" : "Mandatory Correction Reason"}</span>
                </label>
                <textarea
                  rows={3}
                  placeholder={isMarathi ? "उदा. वेळेची नोंद विलंबाने झाली, व्यवस्थापकांनी तपासणी केली..." : "Explain why timestamp is being modified (e.g. Verified with CCTV/register)..."}
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  className="glass-input text-xs"
                  required
                />
              </div>

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

              <div>
                <label className="block text-xs font-semibold text-brand-dark mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>{t.resetPinReason}</span>
                </label>
                <textarea
                  rows={2}
                  placeholder={isMarathi ? "उदा. कर्मचारी पिन विसरले..." : "e.g. Staff requested reset after forgotten PIN..."}
                  value={resetPinReason}
                  onChange={(e) => setResetPinReason(e.target.value)}
                  className="glass-input text-xs"
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
      {/* MODAL 4: STAFF ACTION MENU (Triggered by 3s Hold)         */}
      {/* ======================================================== */}
      {staffActionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/40 backdrop-blur-sm animate-fadeIn">
          <GlassCard className="w-full max-w-sm relative !p-6 border-white/80 shadow-2xl">
            <button
              onClick={() => setStaffActionTarget(null)}
              className="absolute right-4 top-4 p-1.5 rounded-full hover:bg-black/5 text-brand-muted hover:text-brand-dark transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-2xl bg-brand-primary/15 text-brand-dark flex items-center justify-center font-bold text-lg mx-auto mb-2">
                {staffActionTarget.full_name.charAt(0).toUpperCase()}
              </div>
              <h3 className="text-base font-bold text-brand-dark">
                {staffActionTarget.full_name}
              </h3>
              <p className="text-xs text-brand-muted font-medium">
                {formatPhone(staffActionTarget.phone_number)} • {staffActionTarget.role}
              </p>
              <p className="text-[11px] text-brand-muted/80 mt-1">
                {isMarathi ? "कृपया खालीलपैकी एक पर्याय निवडा" : "Please select an action to perform"}
              </p>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  const target = staffActionTarget;
                  setStaffActionTarget(null);
                  setResetPinStaff(target);
                  setResetPinError(null);
                  setNewStaffPin("");
                  setConfirmStaffPin("");
                  setResetPinReason("");
                }}
                className="w-full p-3.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-950 font-bold text-xs flex items-center justify-between transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-amber-500/20 text-amber-800">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <div className="font-bold">{t.resetPinButton}</div>
                    <div className="text-[10px] text-amber-800/80 font-normal">
                      {isMarathi ? "कर्मचाऱ्याचा ६-अंकी लॉगिन पिन बदला" : "Set new 6-digit PIN for staff"}
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-amber-700 group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                type="button"
                onClick={() => {
                  const target = staffActionTarget;
                  setStaffActionTarget(null);
                  setDeletingStaff(target);
                }}
                className="w-full p-3.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-900 font-bold text-xs flex items-center justify-between transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-red-500/20 text-red-700">
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <div className="font-bold">{t.deleteStaff}</div>
                    <div className="text-[10px] text-red-700/80 font-normal">
                      {isMarathi ? "कर्मचारी व सर्व नोंदी कायमच्या हटवा" : "Permanently remove from database"}
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-red-600 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            <div className="mt-4 pt-3 border-t border-brand-dark/10">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStaffActionTarget(null)}
                className="w-full text-xs !py-2.5"
              >
                {t.cancel}
              </Button>
            </div>
          </GlassCard>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 5: DELETE STAFF CONFIRMATION                        */}
      {/* ======================================================== */}
      {deletingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/50 backdrop-blur-sm animate-fadeIn">
          <GlassCard className="w-full max-w-sm relative !p-6 border-red-500/30 shadow-2xl">
            <div className="flex items-center gap-3 mb-3 text-red-600">
              <div className="p-2.5 rounded-full bg-red-500/15">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-brand-dark">
                  {t.deleteStaff}
                </h3>
                <span className="text-[11px] font-semibold text-red-600">
                  {isMarathi ? "कायमस्वरूपी कृती" : "Permanent Action"}
                </span>
              </div>
            </div>

            <p className="text-xs text-brand-dark/90 leading-relaxed mb-4">
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
          </GlassCard>
        </div>
      )}
    </div>
  );
};
