import React, { useEffect, useState, useMemo, useCallback } from "react";
import { GlassCard } from "../../components/common/GlassCard";
import { Button } from "../../components/common/Button";
import { StatusBadge } from "../../components/common/Badge";
import { IOSSegmentedSwitch } from "../../components/common/IOSSegmentedSwitch";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { adminAPI, reportsAPI } from "../../services/api";
import type {
  DailyMonitorResponse,
  DailyMonitorStaffItem,
  UserSummary,
  AttendanceEvent,
  AuditLog,
  OfficeLocationConfig,
} from "../../types";
import {
  Shield,
  ShieldAlert,
  QrCode,
  Calendar,
  RefreshCw,
  PlusCircle,
  AlertTriangle,
  AlertCircle,
  FileDown,
  Search,
  CheckCircle2,
  Users,
  UserCheck,
  UserX,
  History,
  FileText,
  Edit2,
  X,
  Clock,
  KeyRound,
  Eye,
  EyeOff,
  MapPin,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

export const AdminDashboard: React.FC = () => {
  const { isSuperAdmin } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();

  const [monitorData, setMonitorData] = useState<DailyMonitorResponse | null>(null);
  const [targetDate, setTargetDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PRESENT" | "ON_BREAK" | "COMPLETED" | "NOT_STARTED">("ALL");

  // PDF Report State
  const [reportType, setReportType] = useState<"weekly" | "monthly">("weekly");
  const [reportDate, setReportDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [reportMonth, setReportMonth] = useState<number>(new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState<number>(new Date().getFullYear());
  const [reportLang, setReportLang] = useState<"en" | "mr">(language);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [reportFeedback, setReportFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Super Admin Staff List & Role Management
  const [allStaff, setAllStaff] = useState<UserSummary[]>([]);
  const [roleActionStaff, setRoleActionStaff] = useState<UserSummary | null>(null);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  // Manual Add Modal State
  const [selectedStaff, setSelectedStaff] = useState<DailyMonitorStaffItem | null>(null);
  const [manualEventType, setManualEventType] = useState("OFFICE_IN");
  const [manualTime, setManualTime] = useState("09:30");
  const [manualReason, setManualReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Individual Staff Attendance History Modal State
  const [historyStaff, setHistoryStaff] = useState<DailyMonitorStaffItem | null>(null);
  const [staffHistory, setStaffHistory] = useState<AttendanceEvent[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Event Correction Modal State
  const [correctingEvent, setCorrectingEvent] = useState<{
    staff: DailyMonitorStaffItem;
    event: AttendanceEvent;
  } | null>(null);
  const [correctionTime, setCorrectionTime] = useState("09:30");
  const [correctionEventType, setCorrectionEventType] = useState("OFFICE_IN");
  const [correctionReason, setCorrectionReason] = useState("");
  const [isSubmittingCorrection, setIsSubmittingCorrection] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  // Audit Logs Modal State
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [auditLogsList, setAuditLogsList] = useState<AuditLog[]>([]);
  const [isLoadingAuditLogs, setIsLoadingAuditLogs] = useState(false);

  // Reset Staff PIN Modal State
  const [resetPinStaff, setResetPinStaff] = useState<{ id: string; full_name: string; phone_number: string } | null>(null);
  const [newStaffPin, setNewStaffPin] = useState("");
  const [confirmStaffPin, setConfirmStaffPin] = useState("");
  const [resetPinReason, setResetPinReason] = useState("");
  const [isSubmittingResetPin, setIsSubmittingResetPin] = useState(false);
  const [resetPinError, setResetPinError] = useState<string | null>(null);
  const [showNewStaffPin, setShowNewStaffPin] = useState(false);

  // Office Location Configuration State (Super Admin)
  const [officeLocation, setOfficeLocation] = useState<OfficeLocationConfig | null>(null);
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [editLat, setEditLat] = useState("");
  const [editLon, setEditLon] = useState("");
  const [editRadius, setEditRadius] = useState("");
  const [locationReason, setLocationReason] = useState("");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationSuccess, setLocationSuccess] = useState<string | null>(null);
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);

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
    if (!resetPinReason.trim()) {
      setResetPinError("Please provide an administrative reason for the PIN reset.");
      return;
    }

    setIsSubmittingResetPin(true);
    try {
      await adminAPI.resetPin(resetPinStaff.id, newStaffPin, confirmStaffPin, resetPinReason.trim());
      setActionSuccess(`${t.resetPinSuccess} (${resetPinStaff.full_name})`);
      setResetPinStaff(null);
      setNewStaffPin("");
      setConfirmStaffPin("");
      setResetPinReason("");
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setResetPinError(typeof detail === "string" ? detail : "Failed to reset PIN.");
    } finally {
      setIsSubmittingResetPin(false);
    }
  };

  const fetchMonitor = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await adminAPI.getDailyMonitor(targetDate);
      setMonitorData(data);
    } catch (err) {
      console.error("Failed to load admin monitor data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [targetDate]);

  const fetchStaffList = useCallback(async () => {
    if (!isSuperAdmin) return;
    try {
      const staff = await adminAPI.listStaff();
      setAllStaff(staff);
    } catch (err) {
      console.error("Failed to fetch staff list:", err);
    }
  }, [isSuperAdmin]);

  const fetchOfficeLocation = useCallback(async () => {
    if (!isSuperAdmin) return;
    try {
      const data = await adminAPI.getOfficeLocation();
      setOfficeLocation(data);
      setEditLat(data.office_latitude.toString());
      setEditLon(data.office_longitude.toString());
      setEditRadius(data.geofence_radius_meters.toString());
    } catch (err) {
      console.error("Failed to load office location:", err);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    fetchMonitor();
  }, [fetchMonitor]);

  useEffect(() => {
    fetchStaffList();
  }, [fetchStaffList]);

  useEffect(() => {
    fetchOfficeLocation();
  }, [fetchOfficeLocation]);

  const handleUpdateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationReason || locationReason.trim().length < 5) {
      setLocationError("Please enter a valid justification (minimum 5 characters).");
      return;
    }
    const lat = parseFloat(editLat);
    const lon = parseFloat(editLon);
    const rad = parseFloat(editRadius);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      setLocationError("Latitude must be between -90 and 90.");
      return;
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
      setLocationError("Longitude must be between -180 and 180.");
      return;
    }
    if (isNaN(rad) || rad <= 0 || rad > 10000) {
      setLocationError("Radius must be greater than 0 meters (max 10,000m).");
      return;
    }

    setIsUpdatingLocation(true);
    setLocationError(null);
    setLocationSuccess(null);

    try {
      const updated = await adminAPI.updateOfficeLocation({
        office_latitude: lat,
        office_longitude: lon,
        geofence_radius_meters: rad,
        reason: locationReason.trim(),
      });
      setOfficeLocation(updated);
      setIsEditingLocation(false);
      setLocationReason("");
      setLocationSuccess("Office coordinates & geofence updated successfully!");
      setTimeout(() => setLocationSuccess(null), 4000);
    } catch (err: any) {
      setLocationError(err.response?.data?.detail || "Failed to update office location.");
    } finally {
      setIsUpdatingLocation(false);
    }
  };

  // Filtered staff list for attendance monitor
  const filteredStaffAttendance = useMemo(() => {
    if (!monitorData?.staff_attendance) return [];
    return monitorData.staff_attendance.filter((item) => {
      const matchesSearch =
        item.user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.user.phone_number.includes(searchQuery);

      if (!matchesSearch) return false;

      if (statusFilter === "ALL") return true;
      if (statusFilter === "PRESENT") return item.status === "CHECKED_IN" || item.status === "RETURNED_FROM_LUNCH";
      if (statusFilter === "ON_BREAK") return item.status === "ON_LUNCH_BREAK";
      if (statusFilter === "COMPLETED") return item.status === "COMPLETED";
      if (statusFilter === "NOT_STARTED") return item.status === "NOT_STARTED";
      return true;
    });
  }, [monitorData, searchQuery, statusFilter]);

  // Open Staff History
  const openStaffHistoryModal = async (staff: DailyMonitorStaffItem) => {
    setHistoryStaff(staff);
    setIsLoadingHistory(true);
    try {
      const history = await adminAPI.getStaffHistory(staff.user.id);
      setStaffHistory(history);
    } catch (err) {
      console.error("Failed to fetch staff history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Open Audit Logs
  const openAuditLogsModal = async () => {
    setShowAuditLogs(true);
    setIsLoadingAuditLogs(true);
    try {
      const logs = await adminAPI.getAuditLogs();
      setAuditLogsList(logs);
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    } finally {
      setIsLoadingAuditLogs(false);
    }
  };

  // Open Event Correction Modal
  const openCorrectionModal = (staff: DailyMonitorStaffItem, event: AttendanceEvent) => {
    setCorrectingEvent({ staff, event });
    setCorrectionEventType(event.event_type);
    // Extract HH:MM from ISO or default
    const timeMatch = event.scanned_at ? event.scanned_at.match(/T(\d{2}:\d{2})/) : null;
    setCorrectionTime(timeMatch ? timeMatch[1] : "09:30");
    setCorrectionReason("");
    setCorrectionError(null);
  };

  const handleManualAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) return;
    setModalError(null);

    if (!manualReason || manualReason.trim().length < 5) {
      setModalError("Please provide a clear written reason for the manual attendance adjustment.");
      return;
    }

    setIsSubmitting(true);
    try {
      const timestampIso = `${targetDate}T${manualTime}:00Z`;
      await adminAPI.manualAdd({
        user_id: selectedStaff.user.id,
        event_type: manualEventType,
        event_date: targetDate,
        scanned_at: timestampIso,
        reason: manualReason.trim(),
      });
      setActionSuccess(`Record added for ${selectedStaff.user.full_name}`);
      setSelectedStaff(null);
      setManualReason("");
      fetchMonitor();
    } catch (err: any) {
      setModalError(err.response?.data?.detail || "Failed to inject manual record.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingEvent) return;
    setCorrectionError(null);

    if (!correctionReason || correctionReason.trim().length < 5) {
      setCorrectionError("Please provide a clear written justification for correcting this timestamp.");
      return;
    }

    setIsSubmittingCorrection(true);
    try {
      const eventDate = correctingEvent.event.event_date;
      const timestampIso = `${eventDate}T${correctionTime}:00Z`;

      await adminAPI.correct({
        record_id: correctingEvent.event.id,
        new_event_type: correctionEventType,
        new_scanned_at: timestampIso,
        reason: correctionReason.trim(),
      });

      setActionSuccess(t.correctSuccess);
      setCorrectingEvent(null);
      fetchMonitor();
      if (historyStaff) {
        openStaffHistoryModal(historyStaff);
      }
    } catch (err: any) {
      setCorrectionError(err.response?.data?.detail || "Failed to update record.");
    } finally {
      setIsSubmittingCorrection(false);
    }
  };

  // PDF Report Download
  const handleDownloadReport = async () => {
    setIsDownloadingPdf(true);
    setReportFeedback(null);
    try {
      let blob: Blob;
      let filename = "";

      if (reportType === "weekly") {
        blob = await reportsAPI.downloadWeekly(reportDate, reportLang);
        filename = `Shivam_Weekly_Report_${reportDate}_${reportLang}.pdf`;
      } else {
        blob = await reportsAPI.downloadMonthly(reportYear, reportMonth, reportLang);
        filename = `Shivam_Monthly_Report_${reportYear}_${String(reportMonth).padStart(2, "0")}_${reportLang}.pdf`;
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setReportFeedback({ type: "success", message: t.reportSuccess });
    } catch (err) {
      console.error("PDF download error:", err);
      setReportFeedback({ type: "error", message: t.reportError });
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // Super Admin: Toggle Role
  const handleRoleChangeConfirm = async () => {
    if (!roleActionStaff) return;
    setIsUpdatingRole(true);
    try {
      const newRole = roleActionStaff.role === "ADMIN" ? "STAFF" : "ADMIN";
      await adminAPI.updateUserRole(roleActionStaff.id, newRole);
      setActionSuccess(t.roleChangeSuccess);
      setRoleActionStaff(null);
      fetchStaffList();
      fetchMonitor();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to update role.");
    } finally {
      setIsUpdatingRole(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Admin Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-primary uppercase tracking-wider">
            <Shield className="w-3.5 h-3.5" />
            <span>{isSuperAdmin ? "Super Admin" : "Branch Admin"}</span>
          </span>
          <h2 className="text-lg font-bold text-brand-dark">{t.adminPanel}</h2>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={openAuditLogsModal}
            className="p-2 rounded-xl bg-white/50 border border-white/70 hover:bg-white text-brand-dark transition-all text-xs font-semibold flex items-center gap-1 shadow-xs"
            title={t.auditLogsTitle}
          >
            <FileText className="w-3.5 h-3.5 text-brand-primary" />
            <span className="hidden sm:inline">Audit Logs</span>
          </button>

          <Button
            variant="secondary"
            onClick={() => navigate("/kiosk")}
            className="!px-3 !py-1.5 text-xs font-bold"
            icon={<QrCode className="w-4 h-4 text-brand-primary" />}
          >
            Kiosk
          </Button>

          <button
            onClick={() => {
              fetchMonitor();
              if (isSuperAdmin) fetchStaffList();
            }}
            className="p-2 rounded-xl bg-white/50 border border-white/70 hover:bg-white text-brand-muted hover:text-brand-dark transition-all"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-900 text-xs font-semibold flex items-center justify-between shadow-sm animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button
            onClick={() => setActionSuccess(null)}
            className="p-1 rounded-full hover:bg-emerald-600/20 text-emerald-700 transition-colors ml-2"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Date Picker & Overview Metrics */}
      <GlassCard className="!p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-brand-dark flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-brand-primary" />
            <span>Attendance Date</span>
          </span>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white/70 border border-brand-dark/20 text-brand-dark outline-none"
          />
        </div>

        {/* Counter Grid */}
        <div className="grid grid-cols-4 gap-2 pt-1 text-center">
          <div className="p-2 rounded-xl bg-white/60 border border-white/80">
            <span className="text-[10px] text-brand-muted font-bold block">Total</span>
            <span className="text-base font-black text-brand-dark">
              {monitorData?.counts.total_staff || 0}
            </span>
          </div>
          <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
            <span className="text-[10px] text-emerald-800 font-bold block">Present</span>
            <span className="text-base font-black text-emerald-700">
              {monitorData?.counts.present || 0}
            </span>
          </div>
          <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30">
            <span className="text-[10px] text-amber-800 font-bold block">On Break</span>
            <span className="text-base font-black text-amber-700">
              {monitorData?.counts.on_break || 0}
            </span>
          </div>
          <div className="p-2 rounded-xl bg-blue-500/15 border border-blue-500/30">
            <span className="text-[10px] text-blue-800 font-bold block">Done</span>
            <span className="text-base font-black text-blue-700">
              {monitorData?.counts.completed || 0}
            </span>
          </div>
        </div>
      </GlassCard>

      {/* PDF Reports Section */}
      <GlassCard className="!p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-brand-dark uppercase tracking-wider flex items-center gap-1.5">
            <FileDown className="w-4 h-4 text-brand-primary" />
            <span>{t.reportsTitle}</span>
          </h3>

          <IOSSegmentedSwitch<"weekly" | "monthly">
            options={[
              { value: "weekly", label: t.weeklyReport },
              { value: "monthly", label: t.monthlyReport },
            ]}
            value={reportType}
            onChange={(val) => setReportType(val)}
            size="sm"
          />
        </div>

        {reportFeedback && (
          <div
            className={`p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between ${
              reportFeedback.type === "success"
                ? "bg-emerald-500/15 text-emerald-800 border border-emerald-500/30"
                : "bg-red-500/15 text-red-800 border border-red-500/30"
            }`}
          >
            <span>{reportFeedback.message}</span>
            <button
              onClick={() => setReportFeedback(null)}
              className="p-1 rounded-full hover:bg-black/10 text-brand-dark transition-colors ml-2"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs">
          {reportType === "weekly" ? (
            <div>
              <label className="block text-[10px] font-bold text-brand-muted mb-1">
                {t.selectDate}
              </label>
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-white/70 border border-brand-dark/15 text-xs text-brand-dark"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="block text-[10px] font-bold text-brand-muted mb-1">Month</label>
                <select
                  value={reportMonth}
                  onChange={(e) => setReportMonth(Number(e.target.value))}
                  className="w-full px-2 py-1.5 rounded-lg bg-white/70 border border-brand-dark/15 text-xs text-brand-dark font-medium"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {new Date(2026, m - 1).toLocaleString("en", { month: "short" })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-brand-muted mb-1">Year</label>
                <input
                  type="number"
                  value={reportYear}
                  onChange={(e) => setReportYear(Number(e.target.value))}
                  className="w-full px-2 py-1.5 rounded-lg bg-white/70 border border-brand-dark/15 text-xs text-brand-dark font-medium"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold text-brand-muted mb-1">
              {t.reportLanguage}
            </label>
            <select
              value={reportLang}
              onChange={(e) => setReportLang(e.target.value as "en" | "mr")}
              className="w-full px-2.5 py-1.5 rounded-lg bg-white/70 border border-brand-dark/15 text-xs text-brand-dark font-medium"
            >
              <option value="en">English (Default)</option>
              <option value="mr">मराठी (देवनागरी)</option>
            </select>
          </div>
        </div>

        <Button
          variant="primary"
          onClick={handleDownloadReport}
          isLoading={isDownloadingPdf}
          className="w-full !py-2.5 text-xs font-bold"
          icon={<FileDown className="w-4 h-4" />}
        >
          {isDownloadingPdf ? t.downloading : t.downloadPdf}
        </Button>
      </GlassCard>

      {/* Staff Roster: Search & Filter Pills */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold text-brand-dark uppercase tracking-wider">
            Staff Attendance Roster
          </h3>
          <span className="text-[11px] font-semibold text-brand-muted">
            {filteredStaffAttendance.length} staff
          </span>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-brand-muted" />
          <input
            type="text"
            placeholder={t.searchStaffPlaceholder}
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

        {isLoading ? (
          <div className="py-8 text-center text-xs text-brand-muted font-medium">
            Loading attendance records...
          </div>
        ) : filteredStaffAttendance.length === 0 ? (
          <GlassCard className="text-center py-6 text-xs text-brand-muted">
            {t.noStaffFound}
          </GlassCard>
        ) : (
          filteredStaffAttendance.map((item) => (
            <GlassCard key={item.user.id} className="!p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-brand-dark">
                    {item.user.full_name}
                  </h4>
                  <span className="text-[11px] text-brand-muted font-medium">
                    {item.user.phone_number}
                  </span>
                </div>
                <StatusBadge status={item.status} size="sm" />
              </div>

              {/* Event timestamps pills */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {item.events.map((evt) => (
                  <button
                    key={evt.id}
                    onClick={() => openCorrectionModal(item, evt)}
                    className="px-2 py-0.5 rounded-md bg-white/70 border border-white hover:border-brand-primary/60 text-[10px] font-medium text-brand-dark flex items-center gap-1 transition-all"
                    title="Click to correct timestamp"
                  >
                    <span className="font-bold">{evt.event_type.replace(/_/g, " ")}</span>:{" "}
                    {evt.scanned_at_ist}
                    {evt.verification_method === "QR_GPS" && (
                      <span
                        className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/15 text-emerald-800 font-semibold flex items-center gap-0.5"
                        title={`GPS Verified: ${evt.verified_distance_meters !== null && evt.verified_distance_meters !== undefined ? `${Math.round(evt.verified_distance_meters)}m from office` : "Verified"}`}
                      >
                        <MapPin className="w-2.5 h-2.5 text-emerald-600" />
                        {evt.verified_distance_meters !== null && evt.verified_distance_meters !== undefined
                          ? `${Math.round(evt.verified_distance_meters)}m`
                          : "GPS"}
                      </span>
                    )}
                    {evt.verification_method === "MANUAL_ADMIN" && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-purple-500/15 text-purple-800 font-semibold flex items-center gap-0.5">
                        <ShieldAlert className="w-2.5 h-2.5 text-purple-600" />
                        Manual
                      </span>
                    )}
                    {evt.is_manually_corrected && (
                      <ShieldAlert className="w-2.5 h-2.5 text-amber-600 inline ml-0.5" />
                    )}
                    <Edit2 className="w-2.5 h-2.5 text-brand-muted hover:text-brand-primary" />
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-1.5 border-t border-brand-dark/10">
                <button
                  onClick={() => {
                    setResetPinStaff(item.user);
                    setResetPinError(null);
                    setNewStaffPin("");
                    setConfirmStaffPin("");
                    setResetPinReason("");
                  }}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-500/15 text-amber-900 hover:bg-amber-500/25 transition-all flex items-center gap-1"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-700" />
                  <span>{t.resetPinButton}</span>
                </button>

                <button
                  onClick={() => openStaffHistoryModal(item)}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white/60 text-brand-dark hover:bg-white transition-all flex items-center gap-1"
                >
                  <History className="w-3.5 h-3.5 text-brand-muted" />
                  <span>{t.viewHistory}</span>
                </button>

                <button
                  onClick={() => setSelectedStaff(item)}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-brand-primary/15 text-brand-dark hover:bg-brand-primary/25 transition-all flex items-center gap-1"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-brand-primary" />
                  <span>Manual Adjust</span>
                </button>
              </div>
            </GlassCard>
          ))
        )}
      </div>

      {/* Super Admin Role Management Section */}
      {isSuperAdmin && (
        <GlassCard className="!p-4 space-y-3 border-amber-500/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-800">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-brand-dark uppercase tracking-wider">
                {t.superAdminTitle}
              </h3>
              <p className="text-[11px] text-brand-muted">{t.superAdminDesc}</p>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            {allStaff.length === 0 ? (
              <p className="text-xs text-brand-muted text-center py-2">No registered staff found.</p>
            ) : (
              allStaff.map((staff) => {
                const isAdmin = staff.role === "ADMIN";
                const isSuper = staff.role === "SUPER_ADMIN";

                return (
                  <div
                    key={staff.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-white/50 border border-white/80"
                  >
                    <div>
                      <div className="text-xs font-bold text-brand-dark flex items-center gap-1.5">
                        <span>{staff.full_name}</span>
                        {isSuper && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-500/20 text-amber-800 border border-amber-500/30">
                            SUPER ADMIN
                          </span>
                        )}
                        {isAdmin && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-teal-500/20 text-teal-800 border border-teal-500/30">
                            ADMIN
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-brand-muted">{staff.phone_number}</span>
                    </div>

                    {!isSuper && (
                      <button
                        onClick={() => setRoleActionStaff(staff)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                          isAdmin
                            ? "bg-red-500/15 text-red-800 hover:bg-red-500/25"
                            : "bg-teal-500/15 text-teal-800 hover:bg-teal-500/25"
                        }`}
                      >
                        {isAdmin ? (
                          <>
                            <UserX className="w-3.5 h-3.5" />
                            <span>{t.revokeAdmin}</span>
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>{t.assignAdmin}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </GlassCard>
      )}

      {/* Super Admin Office Location & Geofence Settings Section */}
      {isSuperAdmin && (
        <GlassCard className="!p-4 space-y-3 border-emerald-500/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-800">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-brand-dark uppercase tracking-wider">
                  {t.officeLocationSettings}
                </h3>
                <p className="text-[11px] text-brand-muted">
                  Official Shivam Patsanstha GPS coordinates and permitted geofence boundary.
                </p>
              </div>
            </div>

            {!isEditingLocation ? (
              <button
                onClick={() => {
                  setIsEditingLocation(true);
                  setLocationError(null);
                  setLocationSuccess(null);
                }}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all flex items-center gap-1 shadow-sm"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Configure</span>
              </button>
            ) : (
              <button
                onClick={() => setIsEditingLocation(false)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-200 text-brand-dark hover:bg-gray-300 transition-all flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            )}
          </div>

          {locationSuccess && (
            <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-900 text-xs font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{locationSuccess}</span>
            </div>
          )}

          {locationError && (
            <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-900 text-xs font-medium flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{locationError}</span>
            </div>
          )}

          {!isEditingLocation ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
              <div className="p-2.5 rounded-xl bg-white/60 border border-white/80">
                <span className="text-[10px] text-brand-muted block font-semibold">OFFICE LATITUDE</span>
                <span className="font-mono font-bold text-brand-dark">
                  {officeLocation?.office_latitude ?? "18.1361880"}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/60 border border-white/80">
                <span className="text-[10px] text-brand-muted block font-semibold">OFFICE LONGITUDE</span>
                <span className="font-mono font-bold text-brand-dark">
                  {officeLocation?.office_longitude ?? "74.5104810"}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/60 border border-white/80">
                <span className="text-[10px] text-brand-muted block font-semibold">GEOFENCE RADIUS</span>
                <span className="font-mono font-bold text-emerald-700">
                  {officeLocation?.geofence_radius_meters ?? "100"} meters
                </span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleUpdateLocation} className="space-y-3 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-brand-dark block mb-1">
                    Latitude (-90 to 90)
                  </label>
                  <input
                    type="number"
                    step="0.0000001"
                    value={editLat}
                    onChange={(e) => setEditLat(e.target.value)}
                    required
                    className="glass-input text-xs w-full font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-brand-dark block mb-1">
                    Longitude (-180 to 180)
                  </label>
                  <input
                    type="number"
                    step="0.0000001"
                    value={editLon}
                    onChange={(e) => setEditLon(e.target.value)}
                    required
                    className="glass-input text-xs w-full font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-brand-dark block mb-1">
                    Geofence Radius (meters)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="10"
                    max="10000"
                    value={editRadius}
                    onChange={(e) => setEditRadius(e.target.value)}
                    required
                    className="glass-input text-xs w-full font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-brand-dark block mb-1">
                  Audit Justification / Reason (Mandatory)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Relocated to newly inaugurated branch premises"
                  value={locationReason}
                  onChange={(e) => setLocationReason(e.target.value)}
                  required
                  minLength={5}
                  className="glass-input text-xs w-full"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsEditingLocation(false)}
                  className="text-xs !py-1.5 px-3"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isUpdatingLocation}
                  className="text-xs !py-1.5 px-3"
                >
                  Save Coordinates
                </Button>
              </div>
            </form>
          )}
        </GlassCard>
      )}

      {/* Role Change Confirmation Modal */}
      {roleActionStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/40 backdrop-blur-sm animate-fadeIn">
          <GlassCard className="w-full max-w-sm relative !p-6 border-white/80 shadow-2xl">
            <button
              onClick={() => setRoleActionStaff(null)}
              className="absolute right-4 top-4 p-1.5 rounded-full hover:bg-black/5 text-brand-muted hover:text-brand-dark transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-base font-bold text-brand-dark mb-1">
              {roleActionStaff.role === "ADMIN" ? t.revokeAdmin : t.assignAdmin}
            </h3>
            <p className="text-xs text-brand-muted mb-4">
              {t.confirmRoleChange}:{" "}
              <span className="font-bold text-brand-dark">{roleActionStaff.full_name}</span> (+91{" "}
              {roleActionStaff.phone_number})
            </p>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRoleActionStaff(null)}
                className="flex-1 text-xs !py-2.5"
              >
                {t.cancel}
              </Button>
              <Button
                type="button"
                variant="primary"
                isLoading={isUpdatingRole}
                onClick={handleRoleChangeConfirm}
                className="flex-1 text-xs !py-2.5 font-bold"
              >
                Confirm
              </Button>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Manual Add Modal */}
      {selectedStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/40 backdrop-blur-sm animate-fadeIn">
          <GlassCard className="w-full max-w-sm relative !p-6 border-white/80 shadow-2xl">
            <button
              onClick={() => setSelectedStaff(null)}
              className="absolute right-4 top-4 p-1.5 rounded-full hover:bg-black/5 text-brand-muted hover:text-brand-dark transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-base font-bold text-brand-dark mb-1">
              Manual Attendance Adjustment
            </h3>
            <p className="text-xs text-brand-muted mb-4">
              Staff: <span className="font-bold text-brand-dark">{selectedStaff.user.full_name}</span>
            </p>

            {modalError && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 text-xs font-medium">
                {modalError}
              </div>
            )}

            <form onSubmit={handleManualAddSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-brand-dark mb-1">
                  Event Type
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

              <div>
                <label className="block text-xs font-semibold text-brand-dark mb-1">
                  Time (HH:MM)
                </label>
                <input
                  type="time"
                  value={manualTime}
                  onChange={(e) => setManualTime(e.target.value)}
                  className="glass-input text-xs font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-dark mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Mandatory Written Justification</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Explain why this record is being manually added (e.g. Phone malfunction, field visit, etc.)"
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
                  onClick={() => setSelectedStaff(null)}
                  className="flex-1 text-xs !py-2.5"
                >
                  {t.cancel}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isSubmitting}
                  className="flex-1 text-xs !py-2.5 font-bold"
                >
                  Save Record
                </Button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      {/* Correct Existing Record Modal */}
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
              Staff: <span className="font-bold text-brand-dark">{correctingEvent.staff.user.full_name}</span>
              <br />
              Current: <span className="font-semibold">{correctingEvent.event.event_type}</span> at{" "}
              {correctingEvent.event.scanned_at_ist}
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

              <div>
                <label className="block text-xs font-semibold text-brand-dark mb-1">
                  {t.newTime}
                </label>
                <input
                  type="time"
                  value={correctionTime}
                  onChange={(e) => setCorrectionTime(e.target.value)}
                  className="glass-input text-xs font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-dark mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Mandatory Correction Reason</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Explain why this timestamp is being modified (e.g. Staff recorded at counter late, time adjustment verified by manager)"
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
                  Save Correction
                </Button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      {/* Staff History Modal */}
      {historyStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/40 backdrop-blur-sm animate-fadeIn">
          <GlassCard className="w-full max-w-md max-h-[85vh] flex flex-col relative !p-6 border-white/80 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-brand-dark/10">
              <div>
                <h3 className="text-base font-bold text-brand-dark">
                  {t.employeeHistory}
                </h3>
                <p className="text-xs text-brand-muted">
                  {historyStaff.user.full_name} ({historyStaff.user.phone_number})
                </p>
              </div>
              <button
                onClick={() => setHistoryStaff(null)}
                className="p-1.5 rounded-lg bg-white/60 hover:bg-white text-brand-dark transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 py-3 space-y-2 no-scrollbar">
              {isLoadingHistory ? (
                <div className="py-8 text-center text-xs text-brand-muted font-medium">
                  Loading employee records...
                </div>
              ) : staffHistory.length === 0 ? (
                <div className="py-8 text-center text-xs text-brand-muted">
                  {t.noHistoryFound}
                </div>
              ) : (
                staffHistory.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-2.5 rounded-xl bg-white/60 border border-white/80 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-brand-dark flex items-center gap-1.5 flex-wrap">
                        <span>{rec.event_type.replace(/_/g, " ")}</span>
                        {rec.verification_method === "QR_GPS" && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-800 font-semibold flex items-center gap-0.5">
                            <MapPin className="w-2.5 h-2.5 text-emerald-600" />
                            GPS {rec.verified_distance_meters !== null && rec.verified_distance_meters !== undefined ? `${Math.round(rec.verified_distance_meters)}m` : "Verified"}
                          </span>
                        )}
                        {rec.verification_method === "MANUAL_ADMIN" && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-800 font-semibold flex items-center gap-0.5">
                            <ShieldAlert className="w-2.5 h-2.5 text-purple-600" />
                            Manual
                          </span>
                        )}
                        {rec.is_manually_corrected && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-800 font-semibold">
                            Corrected
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-brand-muted">{rec.event_date}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-brand-primary">
                        {rec.scanned_at_ist}
                      </span>
                      <button
                        onClick={() => openCorrectionModal(historyStaff, rec)}
                        className="p-1 rounded-md bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-dark"
                        title="Correct this record"
                      >
                        <Edit2 className="w-3 h-3 text-brand-primary" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-brand-dark/10">
              <Button
                variant="secondary"
                onClick={() => setHistoryStaff(null)}
                className="w-full text-xs !py-2"
              >
                {t.close}
              </Button>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Audit Logs Modal */}
      {showAuditLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/40 backdrop-blur-sm animate-fadeIn">
          <GlassCard className="w-full max-w-lg max-h-[85vh] flex flex-col relative !p-6 border-white/80 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-brand-dark/10">
              <div>
                <h3 className="text-base font-bold text-brand-dark flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-brand-primary" />
                  <span>{t.auditLogsTitle}</span>
                </h3>
                <p className="text-[11px] text-brand-muted">
                  Immutable tracking of all manual adjustments and corrections
                </p>
              </div>
              <button
                onClick={() => setShowAuditLogs(false)}
                className="p-1.5 rounded-lg bg-white/60 hover:bg-white text-brand-dark transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 py-3 space-y-2.5 no-scrollbar">
              {isLoadingAuditLogs ? (
                <div className="py-8 text-center text-xs text-brand-muted font-medium">
                  Loading audit logs...
                </div>
              ) : auditLogsList.length === 0 ? (
                <div className="py-8 text-center text-xs text-brand-muted">
                  No administrative actions logged yet.
                </div>
              ) : (
                auditLogsList.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-white/60 border border-white/80 space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-brand-dark flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            log.action === "MANUAL_ADDITION" ? "bg-teal-500" : "bg-amber-500"
                          }`}
                        />
                        <span>{log.action.replace(/_/g, " ")}</span>
                      </span>
                      <span className="text-[10px] text-brand-muted flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(log.created_at).toLocaleString()}</span>
                      </span>
                    </div>

                    <div className="text-[11px] text-brand-muted">
                      Admin: <span className="font-semibold text-brand-dark">{log.actor_name}</span>
                    </div>

                    <div className="p-2 rounded-lg bg-white/80 text-[11px] text-brand-dark font-medium border border-brand-dark/5">
                      <span className="text-brand-muted font-bold block mb-0.5">Reason:</span>
                      {log.reason}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-brand-dark/10">
              <Button
                variant="secondary"
                onClick={() => setShowAuditLogs(false)}
                className="w-full text-xs !py-2"
              >
                {t.close}
              </Button>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Reset Staff PIN Modal */}
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
            <h3 className="text-base font-bold text-brand-dark mb-1 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-amber-600" />
              <span>{t.resetPinTitle}</span>
            </h3>
            <p className="text-xs text-brand-muted mb-4">
              Staff: <span className="font-bold text-brand-dark">{resetPinStaff.full_name}</span> ({resetPinStaff.phone_number})
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
                    placeholder="New 6-digit PIN"
                    value={newStaffPin}
                    onChange={(e) => setNewStaffPin(e.target.value.replace(/\D/g, ""))}
                    className="glass-input pr-10 text-sm font-bold tracking-widest"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewStaffPin(!showNewStaffPin)}
                    className="absolute right-3 top-2.5 text-brand-muted hover:text-brand-dark transition-colors"
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
                  placeholder="Confirm 6-digit PIN"
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
                  placeholder="e.g. Employee forgot PIN; identity verified by branch manager"
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
    </div>
  );
};
