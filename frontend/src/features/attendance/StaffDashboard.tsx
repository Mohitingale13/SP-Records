import React, { useEffect, useState } from "react";
import { GlassCard } from "../../components/common/GlassCard";
import { Button } from "../../components/common/Button";
import { StatusBadge } from "../../components/common/Badge";
import { QRScannerModal } from "./QRScannerModal";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { attendanceAPI } from "../../services/api";
import type { AttendanceStatusSummary, AttendanceEventType } from "../../types";
import {
  QrCode,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  RefreshCw,
  LogOut as LogOutIcon,
  Coffee,
  Calendar,
  Info,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

export const StaffDashboard: React.FC = () => {
  const { user } = useAuth();
  const { t, isMarathi } = useLanguage();
  const navigate = useNavigate();

  const [summary, setSummary] = useState<AttendanceStatusSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const data = await attendanceAPI.getTodayStatus();
      setSummary(data);
    } catch (err) {
      console.error("Failed to load today status:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

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
  const getTimeForEvent = (type: AttendanceEventType): string | null => {
    const record = summary?.events.find((e) => e.event_type === type);
    return record ? record.scanned_at_ist : null;
  };

  const getContextualMessage = (): string => {
    if (!summary) return t.msgNotStarted;
    switch (summary.status) {
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

  const completedCount = summary?.events.length || 0;
  const progressPercent = Math.min(100, Math.round((completedCount / 4) * 100));

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
          onClick={fetchStatus}
          className="p-2 rounded-xl bg-white/50 border border-white/70 hover:bg-white/80 active:scale-95 text-brand-muted hover:text-brand-dark transition-all shadow-sm"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Dynamic Contextual Message Banner */}
      <div className="p-3.5 rounded-2xl glass-card-subtle border border-brand-primary/30 flex items-center gap-2.5 text-xs font-semibold text-brand-dark shadow-sm">
        <Info className="w-4 h-4 text-brand-primary shrink-0" />
        <span className="leading-snug">{getContextualMessage()}</span>
      </div>

      {/* Success Notification Banner */}
      {successBanner && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-900 text-xs font-semibold flex items-center justify-between animate-fadeIn shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successBanner}</span>
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
            className="text-xs font-bold text-emerald-700 ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Primary Action Card: Next Expected Event */}
      <GlassCard className="text-center relative overflow-hidden border-brand-primary/30">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-muted">
            {t.todayAttendance}
          </span>
          {summary && <StatusBadge status={summary.status} size="sm" />}
        </div>

        {summary?.is_completed ? (
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
                {summary?.next_expected_event
                  ? getEventName(summary.next_expected_event)
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
            const time = getTimeForEvent(slot.type);
            const isRecorded = !!time;
            const isNext = summary?.next_expected_event === slot.type;

            return (
              <div
                key={slot.type}
                className={`p-3 rounded-xl border transition-all ${
                  isRecorded
                    ? "bg-white/70 border-brand-primary/40 shadow-sm"
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
                    <CheckCircle2 className="w-3.5 h-3.5 text-brand-primary" />
                  ) : (
                    slot.icon
                  )}
                </div>

                <div className="text-xs font-bold text-brand-dark truncate">
                  {slot.label}
                </div>

                <div className="text-[11px] font-semibold mt-1">
                  {isRecorded ? (
                    <span className="text-brand-primary">{time}</span>
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

      {/* History quick link button */}
      <Button
        variant="secondary"
        onClick={() => navigate("/history")}
        className="w-full text-xs font-semibold !py-3"
        icon={<ArrowRight className="w-4 h-4 text-brand-muted" />}
      >
        {t.history}
      </Button>

      {/* QR Scanner Modal */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onSuccess={(event) => {
          setSuccessBanner(`${getEventName(event.event_type)} recorded at ${event.scanned_at_ist}`);
          fetchStatus();
        }}
      />
    </div>
  );
};
