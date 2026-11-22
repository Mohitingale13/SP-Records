import React, { useEffect, useState, useCallback } from "react";
import { GlassCard } from "../../components/common/GlassCard";
import { Button } from "../../components/common/Button";
import { IOSSegmentedSwitch } from "../../components/common/IOSSegmentedSwitch";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { adminAPI, reportsAPI, qrAPI } from "../../services/api";
import QRCode from "qrcode";
import type {
  DailyMonitorResponse,
  UserSummary,
  AuditLog,
  OfficeLocationConfig,
} from "../../types";
import {
  Shield,
  QrCode,
  Calendar,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  FileDown,
  CheckCircle2,
  Users,
  UserCheck,
  UserX,
  FileText,
  Edit2,
  X,
  Clock,
  KeyRound,
  Eye,
  EyeOff,
  MapPin,
  Download,
  Printer,
  Maximize2,
} from "lucide-react";

export const AdminDashboard: React.FC = () => {
  const { isSuperAdmin } = useAuth();
  const { t, language } = useLanguage();
  const isMarathi = language === "mr";
  const formatPhone = (phone?: string) => (phone || "").replace(/^\+91/, "");

  const [monitorData, setMonitorData] = useState<DailyMonitorResponse | null>(null);
  const [targetDate, setTargetDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [isLoading, setIsLoading] = useState(true);

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
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  // Official Static Office QR State & Download
  const [staticQrToken, setStaticQrToken] = useState<string>("");
  const [staticQrDataUrl, setStaticQrDataUrl] = useState<string>("");
  const [isDownloadingQrPdf, setIsDownloadingQrPdf] = useState(false);
  const [isGeneratingPng, setIsGeneratingPng] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [staticOrgName, setStaticOrgName] = useState<string>("Shivam Patsanstha");

  useEffect(() => {
    const fetchStaticQr = async () => {
      try {
        const data = await qrAPI.getOfficeStatic();
        setStaticQrToken(data.token);
        if (data.organization_name) {
          setStaticOrgName(data.organization_name);
        }
        const url = await QRCode.toDataURL(data.token, {
          width: 400,
          margin: 1,
          errorCorrectionLevel: "H",
          color: {
            dark: "#153B43",
            light: "#FFFFFF",
          },
        });
        setStaticQrDataUrl(url);
      } catch (err) {
        console.warn("Failed to load static office QR:", err);
      }
    };

    fetchStaticQr();
  }, []);

  const handleDownloadHighResPng = async () => {
    if (!staticQrToken) return;
    setIsGeneratingPng(true);
    try {
      const highResUrl = await QRCode.toDataURL(staticQrToken, {
        width: 1500,
        margin: 2,
        errorCorrectionLevel: "H",
        color: {
          dark: "#153B43",
          light: "#FFFFFF",
        },
      });

      const a = document.createElement("a");
      a.href = highResUrl;
      a.download = "Shivam_Patsanstha_Attendance_QR_1500px.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setActionSuccess("Full-size 1500px QR image downloaded successfully!");
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      console.error("Failed to generate full-size PNG:", err);
    } finally {
      setIsGeneratingPng(false);
    }
  };

  const handleDownloadPrintablePdf = async () => {
    setIsDownloadingQrPdf(true);
    try {
      const blob = await qrAPI.downloadPrintPdf();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Shivam_Patsanstha_Official_Attendance_QR.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setActionSuccess("Official printable A4 poster PDF downloaded!");
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      console.error("Failed to download poster PDF:", err);
    } finally {
      setIsDownloadingQrPdf(false);
    }
  };

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

  const fetchMonitor = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      const data = await adminAPI.getDailyMonitor(targetDate);
      setMonitorData(data);
    } catch (err) {
      console.error("Failed to load admin monitor data:", err);
    } finally {
      if (!isSilent) setIsLoading(false);
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

  // Real-time automatic background polling & focus refresh (every 20s)
  useEffect(() => {
    const refreshLive = () => {
      if (document.visibilityState === "visible") {
        fetchMonitor(true);
        fetchStaffList();
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
  }, [fetchMonitor, fetchStaffList]);

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

  // PDF Report Download
  const handleDownloadReport = async () => {
    setIsDownloadingPdf(true);
    setReportFeedback(null);
    try {
      let blob: Blob;
      let filename = "";

      if (reportType === "weekly") {
        blob = await reportsAPI.downloadWeekly(reportDate, reportLang);
        filename = `Shivam_Weekly_Report_${reportDate}_${Date.now()}.pdf`;
      } else {
        blob = await reportsAPI.downloadMonthly(reportYear, reportMonth, reportLang);
        filename = `Shivam_Monthly_Report_${reportYear}_${String(reportMonth).padStart(2, "0")}_${Date.now()}.pdf`;
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
      const msg = err.response?.data?.detail;
      setActionError(
        typeof msg === "string"
          ? msg
          : (language === "mr" ? "भूमिका बदलता आली नाही. कृपया पुन्हा प्रयत्न करा." : "Failed to update role. Please try again.")
      );
      setTimeout(() => setActionError(null), 5000);
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

      {actionError && (
        <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-950 text-xs font-semibold flex items-center justify-between shadow-sm animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="p-1 rounded-full hover:bg-rose-600/20 text-rose-700 transition-colors ml-2"
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

      {/* Official Office QR Poster & Counter Standee */}
      <GlassCard className="!p-4 space-y-3.5 border-brand-primary/40 bg-gradient-to-br from-white/70 via-white/50 to-brand-primary/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-brand-primary/20 text-brand-primary flex items-center justify-center shadow-xs">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-brand-dark uppercase tracking-wider">
                {t.officialOfficeQrTitle}
              </h3>
              <p className="text-[11px] text-brand-muted font-medium">
                {isMarathi ? "प्रिंट व लॅमिनेट करून काउंटरवर लावा" : "Print & paste on office counter/entrance"}
              </p>
            </div>
          </div>

          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500/15 text-emerald-800 border border-emerald-500/30 flex items-center gap-1 shadow-xs">
            <MapPin className="w-3 h-3 text-emerald-600" />
            50m GPS
          </span>
        </div>

        {/* QR Code Visual Preview Card (Clickable to showcase full screen) */}
        <div className="flex flex-col sm:flex-row items-center gap-4 p-3 rounded-2xl bg-white/80 border border-brand-primary/30 shadow-xs">
          {staticQrDataUrl ? (
            <div
              onClick={() => setShowQrModal(true)}
              className="p-2 rounded-xl bg-white border border-brand-primary/30 shadow-md shrink-0 cursor-pointer hover:border-brand-primary hover:shadow-lg transition-all group relative"
              title={isMarathi ? "स्क्रीनवर मोठे पाहण्यासाठी क्लिक करा" : "Click to view full screen"}
            >
              <img
                src={staticQrDataUrl}
                alt="Official Office Attendance QR"
                className="w-28 h-28 object-contain rounded-lg transition-transform group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-brand-dark/15 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="p-1 rounded-md bg-white/90 text-brand-dark shadow-xs">
                  <Maximize2 className="w-3.5 h-3.5 text-brand-primary" />
                </span>
              </div>
            </div>
          ) : (
            <div className="w-28 h-28 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-muted shrink-0">
              <RefreshCw className="w-6 h-6 animate-spin text-brand-primary" />
            </div>
          )}

          <div className="space-y-1.5 text-center sm:text-left flex-1 min-w-0">
            <div className="flex items-center justify-center sm:justify-start gap-1.5">
              <h4 className="text-xs font-bold text-brand-dark">
                {isMarathi ? "कायमस्वरूपी उपस्थिती QR" : "Official Attendance QR"}
              </h4>
              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                className="text-[10px] text-brand-primary font-bold hover:underline flex items-center gap-0.5 ml-1"
                title={isMarathi ? "मोठे पहा" : "Enlarge"}
              >
                <Maximize2 className="w-3 h-3" />
                <span>{isMarathi ? "मोठे पहा" : "Show"}</span>
              </button>
            </div>
            <p className="text-[11px] text-brand-muted leading-relaxed font-medium">
              {t.officialOfficeQrDesc}
            </p>
            <div className="flex items-center justify-center sm:justify-start gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-500/10 px-2 py-0.5 rounded-md w-fit mx-auto sm:mx-0">
              <span>✓ 50m GPS</span>
              <span>•</span>
              <span>✓ Offline</span>
              <span>•</span>
              <span className="cursor-pointer underline" onClick={() => setShowQrModal(true)}>
                {isMarathi ? "क्लिक करून दाखवा" : "Click to Show"}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons: Short, concise 1-2 words with format in brackets */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button
            variant="primary"
            onClick={handleDownloadHighResPng}
            disabled={!staticQrDataUrl || isGeneratingPng}
            className="w-full !py-2 text-xs font-bold shadow-sm flex items-center justify-center gap-1.5"
            icon={<Download className="w-3.5 h-3.5" />}
          >
            {t.downloadHighResPng}
          </Button>

          <Button
            variant="secondary"
            onClick={handleDownloadPrintablePdf}
            isLoading={isDownloadingQrPdf}
            className="w-full !py-2 text-xs font-bold border-brand-primary/40 hover:bg-brand-primary/10 flex items-center justify-center gap-1.5"
            icon={<Printer className="w-3.5 h-3.5 text-brand-primary" />}
          >
            {t.downloadPrintablePdf}
          </Button>
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
            {allStaff.filter((s) => {
              const r = s.role as any;
              const roleName = (typeof r === "object" && r?.name) ? r.name : (r || "");
              return roleName !== "SUPER_ADMIN";
            }).length === 0 ? (
              <p className="text-xs text-brand-muted text-center py-2">No registered staff found.</p>
            ) : (
              allStaff
                .filter((s) => {
                  const r = s.role as any;
                  const roleName = (typeof r === "object" && r?.name) ? r.name : (r || "");
                  return roleName !== "SUPER_ADMIN";
                })
                .map((staff) => {
                  const r = staff.role as any;
                  const roleName = (typeof r === "object" && r?.name) ? r.name : (r || "");
                  const isAdmin = roleName === "ADMIN";

                  return (
                    <div
                      key={staff.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-white/50 border border-white/80"
                    >
                      <div>
                        <div className="text-xs font-bold text-brand-dark flex items-center gap-1.5">
                          <span>{staff.full_name}</span>
                          {isAdmin && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-teal-500/20 text-teal-800 border border-teal-500/30">
                              ADMIN
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-brand-muted">{formatPhone(staff.phone_number)}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setResetPinStaff(staff);
                            setResetPinError(null);
                            setNewStaffPin("");
                            setConfirmStaffPin("");
                            setResetPinReason("");
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-900 hover:bg-amber-500/25 transition-all flex items-center gap-1"
                          title={t.resetPinButton}
                        >
                          <KeyRound className="w-3.5 h-3.5 text-amber-700" />
                          <span className="hidden sm:inline">{t.resetPinButton}</span>
                        </button>

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
                      </div>
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
                  {officeLocation?.geofence_radius_meters ?? "50"} meters
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
              <span className="font-bold text-brand-dark">{roleActionStaff.full_name}</span> (
              {formatPhone(roleActionStaff.phone_number)})
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

      {/* Full-Screen QR Showcase Modal (Phone Show / Counter Scan) */}
      {showQrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/70 backdrop-blur-md animate-fadeIn"
          onClick={() => setShowQrModal(false)}
        >
          <GlassCard
            className="w-full max-w-sm sm:max-w-md relative !p-6 border-white/90 shadow-2xl bg-white/95 text-center space-y-4"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute right-4 top-4 p-2 rounded-full hover:bg-black/5 text-brand-muted hover:text-brand-dark transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header info */}
            <div className="space-y-1.5 pt-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500/15 text-emerald-800 border border-emerald-500/30 inline-flex items-center gap-1 shadow-xs">
                <MapPin className="w-3 h-3 text-emerald-600" />
                50m GPS Geofenced
              </span>
              <h3 className="text-base font-bold text-brand-dark">
                {staticOrgName}
              </h3>
              <p className="text-xs text-brand-muted font-medium">
                {isMarathi ? "उपस्थिती नोंदणीसाठी हा QR कोड स्कॅन करा" : "Scan this official QR code to log attendance"}
              </p>
            </div>

            {/* Big Crisp QR Display */}
            <div className="p-4 rounded-2xl bg-white border border-brand-primary/30 shadow-lg mx-auto w-fit">
              {staticQrDataUrl ? (
                <img
                  src={staticQrDataUrl}
                  alt="Official Office Attendance QR"
                  className="w-56 h-56 sm:w-64 sm:h-64 object-contain mx-auto"
                />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center text-brand-muted">
                  <RefreshCw className="w-8 h-8 animate-spin text-brand-primary" />
                </div>
              )}
            </div>

            <p className="text-[11px] text-brand-muted max-w-xs mx-auto leading-tight font-medium">
              {isMarathi
                ? "इतर कर्मचाऱ्यांकडून स्कॅन करून घेण्यासाठी हा स्क्रीन दाखवा किंवा पोस्टर प्रिंट करा."
                : "Display this screen for staff to scan directly, or print the official poster."}
            </p>

            {/* Action buttons inside the modal */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                variant="primary"
                onClick={handleDownloadHighResPng}
                disabled={!staticQrDataUrl || isGeneratingPng}
                className="w-full !py-2.5 text-xs font-bold shadow-sm flex items-center justify-center gap-1.5"
                icon={<Download className="w-3.5 h-3.5" />}
              >
                {t.downloadHighResPng}
              </Button>

              <Button
                variant="secondary"
                onClick={handleDownloadPrintablePdf}
                isLoading={isDownloadingQrPdf}
                className="w-full !py-2.5 text-xs font-bold border-brand-primary/40 hover:bg-brand-primary/10 flex items-center justify-center gap-1.5"
                icon={<Printer className="w-3.5 h-3.5 text-brand-primary" />}
              >
                {t.downloadPrintablePdf}
              </Button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
};
