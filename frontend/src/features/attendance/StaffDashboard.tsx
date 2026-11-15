import React, { useEffect, useState, useMemo, useCallback } from "react";
import { GlassCard } from "../../components/common/GlassCard";
import { Button } from "../../components/common/Button";
import { StatusBadge } from "../../components/common/Badge";
import { QRScannerModal } from "./QRScannerModal";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useOffline } from "../../contexts/OfflineContext";
import { attendanceAPI, qrAPI } from "../../services/api";
import QRCode from "qrcode";
import type { AttendanceStatusSummary, AttendanceEventType, AttendanceEvent } from "../../types";
import { useNavigate } from "react-router-dom";
import {
  QrCode,
  CheckCircle2,
  Clock,
  Sparkles,
  RefreshCw,
  LogOut as LogOutIcon,
  Coffee,
  Calendar,
  Info,
  X,
  Shield,
  ArrowRight,
  History,
  WifiOff,
  MapPin,
  Maximize2,
} from "lucide-react";

export const StaffDashboard: React.FC = () => {
  const { user, isSuperAdmin } = useAuth();
  const { t, isMarathi } = useLanguage();
  const { isOnline, pendingCount, pendingRecords, isSyncing, syncNow, lastSyncMessage } =
    useOffline();
  const navigate = useNavigate();

  const [summary, setSummary] = useState<AttendanceStatusSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [showOfficeQrModal, setShowOfficeQrModal] = useState(false);
  const [staticQrDataUrl, setStaticQrDataUrl] = useState<string>("");
  const [staticOrgName, setStaticOrgName] = useState<string>("Shivam Patsanstha");

  const handleOpenOfficeQr = async () => {
    setShowOfficeQrModal(true);
    if (!staticQrDataUrl) {
      try {
        const data = await qrAPI.getOfficeStatic();
        if (data.organization_name) setStaticOrgName(data.organization_name);
        const url = await QRCode.toDataURL(data.token, {
          width: 500,
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
    }
  };

  const fetchStatus = useCallback(async (isSilent = false) => {
    if (isSuperAdmin) return;
    if (!isSilent) setIsLoading(true);
    try {
      const data = await attendanceAPI.getTodayStatus();
      setSummary(data);
    } catch (err) {
      console.warn("Failed to load today status (possibly offline):", err);
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin) {
      fetchStatus(false);
    }
  }, [isSuperAdmin, fetchStatus]);

  // Real-time automatic background polling & focus refresh (every 25s)
  useEffect(() => {
    if (isSuperAdmin) return;
    const poll = () => {
      if (document.visibilityState === "visible") {
        fetchStatus(true);
      }
    };
    const interval = setInterval(poll, 25000);
    window.addEventListener("focus", poll);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", poll);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [isSuperAdmin, fetchStatus]);

  // Combine server attendance records and local offline-queued records seamlessly
  const effectiveSummary = useMemo(() => {
    const baseEvents: AttendanceEvent[] = summary?.events ? [...summary.events] : [];
    const eventTypeSet = new Set(baseEvents.map((e) => e.event_type));

    // Incorporate offline records that haven't landed in summary yet
    for (const pending of pendingRecords) {
      if (!eventTypeSet.has(pending.event_type)) {
        baseEvents.push({
          id: pending.id,
          event_type: pending.event_type,
          event_date: pending.scanned_at.split("T")[0],
          scanned_at: pending.scanned_at,
          scanned_at_ist: new Date(pending.scanned_at).toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          is_manually_corrected: false,
          reported_accuracy_meters: pending.accuracy,
          verification_method: "OFFLINE_GPS",
        });
        eventTypeSet.add(pending.event_type);
      }
    }

    let status: AttendanceStatusSummary["status"] = "NOT_STARTED";
    let nextExpected: AttendanceEventType | null = "OFFICE_IN";

    if (eventTypeSet.has("OFFICE_OUT")) {
      status = "COMPLETED";
      nextExpected = null;
    } else if (eventTypeSet.has("LUNCH_BREAK_IN")) {
      status = "RETURNED_FROM_LUNCH";
      nextExpected = "OFFICE_OUT";
    } else if (eventTypeSet.has("LUNCH_BREAK_OUT")) {
      status = "ON_LUNCH_BREAK";
      nextExpected = "LUNCH_BREAK_IN";
    } else if (eventTypeSet.has("OFFICE_IN")) {
      status = "CHECKED_IN";
      nextExpected = "LUNCH_BREAK_OUT";
    }

    return {
      date: summary?.date || new Date().toISOString().split("T")[0],
      status,
      next_expected_event: nextExpected,
      events: baseEvents,
      is_completed: status === "COMPLETED",
    };
  }, [summary, pendingRecords]);

  const getEventName = (eventType: AttendanceEventType): string => {
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
        return eventType;
    }
  };

  // Find recorded time for each specific slot
  const getEventRecord = (type: AttendanceEventType): AttendanceEvent | undefined => {
    return effectiveSummary.events.find((e) => e.event_type === type);
  };

  const getContextualMessage = (): string => {
    switch (effectiveSummary.status) {
      case "CHECKED_IN":
        return t.msgCheckedIn;
      case "ON_LUNCH_BREAK":
        return t.msgOnLunch;
      case "RETURNED_FROM_LUNCH":
        return t.msgReturnedLunch;
      case "COMPLETED":
        return t.msgCompleted;
      case "NOT_STARTED":
      default:
        return t.msgNotStarted;
    }
  };

  const timelineSlots: { type: AttendanceEventType; label: string; icon: React.ReactNode }[] = [
    { type: "OFFICE_IN", label: t.officeIn, icon: <Clock className="w-4 h-4 text-emerald-600" /> },
    { type: "LUNCH_BREAK_OUT", label: t.lunchBreakOut, icon: <Coffee className="w-4 h-4 text-amber-600" /> },
    { type: "LUNCH_BREAK_IN", label: t.lunchBreakIn, icon: <Clock className="w-4 h-4 text-teal-600" /> },
    { type: "OFFICE_OUT", label: t.officeOut, icon: <LogOutIcon className="w-4 h-4 text-blue-600" /> },
  ];

  const completedCount = effectiveSummary.events.length;
  const progressPercent = Math.min(100, Math.round((completedCount / 4) * 100));

  // ==========================================
  // SUPER ADMIN EXECUTIVE VIEW (NO SCANNING)
  // ==========================================
  if (isSuperAdmin) {
    return (
      <div className="space-y-4">
        {/* Executive Header */}
        <div className="flex items-center justify-between pt-1">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-brand-dark">
                {user?.full_name || "Super Admin"}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-500/20 text-amber-800 border border-amber-500/30 flex items-center gap-1 shadow-sm">
                <Shield className="w-3 h-3 text-amber-600" />
                Super Admin
              </span>
            </div>
            <p className="text-xs text-brand-muted font-medium flex items-center gap-1.5 mt-0.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>
                {new Date().toLocaleDateString(isMarathi ? "mr-IN" : "en-IN", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </p>
          </div>
        </div>

        {/* Executive Exemption & Privileges Notice */}
        <GlassCard className="border-amber-500/30 bg-gradient-to-br from-amber-50/40 via-white/60 to-brand-primary/5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0 shadow-inner mt-0.5">
              <Shield className="w-5 h-5 text-amber-600" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-brand-dark">
                {t.superAdminExecutiveHub}
              </h3>
              <p className="text-xs text-brand-dark/80 leading-relaxed font-medium">
                {t.superAdminExecutiveNotice}
              </p>
            </div>
          </div>

          {/* Quick System Indicators */}
          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-amber-500/20 text-center">
            <div className="p-2 rounded-xl bg-white/50 border border-white/70">
              <div className="text-[10px] font-bold text-brand-muted uppercase">Geofence</div>
              <div className="text-xs font-bold text-emerald-700 mt-0.5">50m Active</div>
            </div>
            <div className="p-2 rounded-xl bg-white/50 border border-white/70">
              <div className="text-[10px] font-bold text-brand-muted uppercase">QR Security</div>
              <div className="text-xs font-bold text-brand-primary mt-0.5">50m GPS</div>
            </div>
            <div className="p-2 rounded-xl bg-white/50 border border-white/70">
              <div className="text-[10px] font-bold text-brand-muted uppercase">Database</div>
              <div className="text-xs font-bold text-blue-700 mt-0.5">Neon Cloud</div>
            </div>
          </div>
        </GlassCard>

        {/* Administrative Quick Actions */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-bold text-brand-dark uppercase tracking-wider px-1">
            {isMarathi ? "प्रशासकीय साधने" : "Executive Controls"}
          </h4>

          {/* Action 1: Admin Suite */}
          <GlassCard
            onClick={() => navigate("/admin")}
            className="cursor-pointer hover:border-brand-primary/60 transition-all hover:scale-[1.01] active:scale-[0.99] border-brand-primary/30"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-700 flex items-center justify-center shrink-0 shadow-inner">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-brand-dark">{t.adminPanel}</h4>
                  <p className="text-xs text-brand-muted mt-0.5 max-w-[220px] sm:max-w-xs leading-snug">
                    {t.superAdminAdminSuiteDesc}
                  </p>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-white/60 flex items-center justify-center text-brand-muted group-hover:text-brand-dark shadow-sm">
                <ArrowRight className="w-4 h-4 text-brand-primary" />
              </div>
            </div>
          </GlassCard>

          {/* Action 2: Show Office QR on Screen */}
          <GlassCard
            onClick={handleOpenOfficeQr}
            className="cursor-pointer hover:border-blue-500/60 transition-all hover:scale-[1.01] active:scale-[0.99] border-blue-500/30"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/15 text-blue-700 flex items-center justify-center shrink-0 shadow-inner">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-brand-dark">
                    {isMarathi ? "कार्यालयीन QR स्क्रीनवर दाखवा" : "Show Office QR on Screen"}
                  </h4>
                  <p className="text-xs text-brand-muted mt-0.5 max-w-[220px] sm:max-w-xs leading-snug">
                    {isMarathi
                      ? "इतर कर्मचाऱ्यांना उपस्थिती स्कॅन करण्यासाठी हा QR कोड फोनवर दाखवा."
                      : "Display official attendance QR on this screen for staff to scan."}
                  </p>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-white/60 flex items-center justify-center text-brand-muted group-hover:text-brand-dark shadow-sm">
                <Maximize2 className="w-4 h-4 text-blue-600" />
              </div>
            </div>
          </GlassCard>

          {/* Action 3: History & Reports */}
          <GlassCard
            onClick={() => navigate("/history")}
            className="cursor-pointer hover:border-purple-500/60 transition-all hover:scale-[1.01] active:scale-[0.99] border-purple-500/30"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-500/15 text-purple-700 flex items-center justify-center shrink-0 shadow-inner">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-brand-dark">{t.history}</h4>
                  <p className="text-xs text-brand-muted mt-0.5 max-w-[220px] sm:max-w-xs leading-snug">
                    {t.superAdminHistoryDesc}
                  </p>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-white/60 flex items-center justify-center text-brand-muted group-hover:text-brand-dark shadow-sm">
                <ArrowRight className="w-4 h-4 text-purple-600" />
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Full-Screen QR Showcase Modal for Phone */}
        {showOfficeQrModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/70 backdrop-blur-md animate-fadeIn"
            onClick={() => setShowOfficeQrModal(false)}
          >
            <GlassCard
              className="w-full max-w-sm relative !p-6 border-white/90 shadow-2xl bg-white/95 text-center space-y-4"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowOfficeQrModal(false)}
                className="absolute right-4 top-4 p-2 rounded-full hover:bg-black/5 text-brand-muted hover:text-brand-dark transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>

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
                  ? "इतर कर्मचाऱ्यांकडून स्कॅन करून घेण्यासाठी हा स्क्रीन दाखवा."
                  : "Display this screen for staff to scan directly with their phone camera."}
              </p>

              <Button
                variant="primary"
                onClick={() => setShowOfficeQrModal(false)}
                className="w-full !py-2.5 text-xs font-bold"
              >
                {t.close}
              </Button>
            </GlassCard>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // OPERATIONAL STAFF ATTENDANCE VIEW
  // ==========================================
  return (
    <div className="space-y-4">
      {/* Greeting Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h2 className="text-xl font-bold text-brand-dark">
            {user?.full_name}
          </h2>
          <p className="text-xs text-brand-muted font-medium flex items-center gap-1.5 mt-0.5">
            <Calendar className="w-3.5 h-3.5" />
            <span>
              {new Date().toLocaleDateString(isMarathi ? "mr-IN" : "en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </p>
        </div>

        <button
          onClick={() => fetchStatus(false)}
          className="p-2 rounded-xl bg-white/50 border border-white/70 hover:bg-white/80 active:scale-95 text-brand-muted hover:text-brand-dark transition-all shadow-sm"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Offline Mode Banner */}
      {!isOnline && (
        <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-900 text-xs font-semibold flex items-center justify-between shadow-sm animate-fadeIn">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{t.offlineGpsReady}</span>
          </div>
          {pendingCount > 0 && (
            <span className="text-[10px] text-amber-800 bg-amber-500/25 px-2 py-0.5 rounded-full font-bold">
              {pendingCount} {t.offlineSyncPending}
            </span>
          )}
        </div>
      )}

      {/* Online but pending sync banner */}
      {isOnline && pendingCount > 0 && (
        <div className="p-3.5 rounded-2xl bg-blue-500/15 border border-blue-500/30 text-blue-900 text-xs font-semibold flex items-center justify-between shadow-sm animate-fadeIn">
          <div className="flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 text-blue-600 shrink-0 ${isSyncing ? "animate-spin" : ""}`} />
            <span>{pendingCount} {t.offlineSyncPending}</span>
          </div>
          <Button
            variant="primary"
            onClick={syncNow}
            isLoading={isSyncing}
            className="!py-1 !px-2.5 text-[11px] font-bold"
          >
            {t.syncNow}
          </Button>
        </div>
      )}

      {/* Dynamic Contextual Message Banner */}
      <div className="p-3.5 rounded-2xl glass-card-subtle border border-brand-primary/30 flex items-center gap-2.5 text-xs font-semibold text-brand-dark shadow-sm">
        <Info className="w-4 h-4 text-brand-primary shrink-0" />
        <span className="leading-snug">{getContextualMessage()}</span>
      </div>

      {/* Last Sync Message Banner */}
      {lastSyncMessage && (
        <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-900 text-xs font-semibold flex items-center gap-2 animate-fadeIn shadow-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{lastSyncMessage}</span>
        </div>
      )}

      {/* Success Notification Banner */}
      {successBanner && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-900 text-xs font-semibold flex items-center justify-between animate-fadeIn shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successBanner}</span>
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
            className="p-1 rounded-full hover:bg-emerald-600/20 text-emerald-700 transition-colors ml-2"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Primary Action Card: Next Expected Event */}
      <GlassCard className="text-center relative overflow-hidden border-brand-primary/30">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-muted">
            {t.todayAttendance}
          </span>
          <StatusBadge status={effectiveSummary.status} size="sm" />
        </div>

        {effectiveSummary.is_completed ? (
          <div className="py-4 space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-700 flex items-center justify-center mx-auto shadow-inner">
              <Sparkles className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-brand-dark">
              {t.allEventsDone}
            </h3>
            <p className="text-xs text-brand-muted max-w-xs mx-auto">
              {t.msgCompleted}
            </p>
          </div>
        ) : (
          <div className="py-3 space-y-4">
            <div>
              <span className="text-[11px] font-semibold text-brand-muted uppercase tracking-wider">
                {t.nextStep}
              </span>
              <h3 className="text-xl font-extrabold text-brand-dark mt-0.5">
                {effectiveSummary.next_expected_event
                  ? getEventName(effectiveSummary.next_expected_event)
                  : "..."}
              </h3>
            </div>

            <Button
              variant="primary"
              onClick={() => setIsScannerOpen(true)}
              className="w-full !py-3.5 text-sm font-bold shadow-lg shadow-brand-primary/30 animate-pulse"
              icon={<QrCode className="w-5 h-5" />}
            >
              {t.scanQrCode}
            </Button>
          </div>
        )}

        {/* Progress Bar */}
        <div className="mt-4 pt-3 border-t border-white/50">
          <div className="flex items-center justify-between text-[11px] font-semibold text-brand-muted mb-1.5">
            <span>{completedCount} of 4 events completed</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-white/60 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-primary to-brand-secondary transition-all duration-500 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </GlassCard>

      {/* 4-Step Attendance Cycle Timeline Card */}
      <GlassCard className="space-y-3">
        <h4 className="text-xs font-bold text-brand-dark uppercase tracking-wider">
          Daily Attendance Timeline
        </h4>

        <div className="grid grid-cols-2 gap-2.5">
          {timelineSlots.map((slot, index) => {
            const eventRec = getEventRecord(slot.type);
            const isRecorded = !!eventRec;
            const isOfflinePending = eventRec?.verification_method === "OFFLINE_GPS" &&
              pendingRecords.some((p) => p.event_type === slot.type);
            const isNext = effectiveSummary.next_expected_event === slot.type;

            return (
              <div
                key={slot.type}
                className={`p-3 rounded-xl border transition-all ${
                  isRecorded
                    ? isOfflinePending
                      ? "bg-amber-500/10 border-amber-500/40 shadow-sm"
                      : "bg-white/70 border-brand-primary/40 shadow-sm"
                    : isNext
                    ? "bg-brand-primary/10 border-brand-primary/60 ring-2 ring-brand-primary/20"
                    : "bg-white/30 border-white/50 opacity-75"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-brand-muted">
                    #{index + 1}
                  </span>
                  {isRecorded ? (
                    isOfflinePending ? (
                      <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-brand-primary" />
                    )
                  ) : (
                    slot.icon
                  )}
                </div>

                <div className="text-xs font-bold text-brand-dark truncate">
                  {slot.label}
                </div>

                <div className="text-[11px] font-semibold mt-1">
                  {isRecorded ? (
                    <div className="flex flex-col">
                      <span className={isOfflinePending ? "text-amber-800 font-bold" : "text-brand-primary"}>
                        {eventRec.scanned_at_ist}
                      </span>
                      {isOfflinePending && (
                        <span className="text-[9px] text-amber-600 font-medium">
                          {t.offlinePendingBadge}
                        </span>
                      )}
                    </div>
                  ) : isNext ? (
                    <span className="text-brand-dark/70 font-medium">Pending Scan</span>
                  ) : (
                    <span className="text-brand-muted/60">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* QR Scanner Modal with Offline Buffering */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        expectedEventType={effectiveSummary.next_expected_event}
        onSuccess={(event, isOffline) => {
          if (isOffline) {
            setSuccessBanner(
              `${getEventName(event.event_type)} recorded offline at ${event.scanned_at_ist}. Will sync automatically when internet restores.`
            );
          } else {
            setSuccessBanner(
              `${getEventName(event.event_type)} recorded at ${event.scanned_at_ist}`
            );
            fetchStatus();
          }
        }}
      />
    </div>
  );
};
