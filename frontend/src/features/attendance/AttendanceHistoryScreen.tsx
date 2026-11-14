import React, { useEffect, useState } from "react";
import { GlassCard } from "../../components/common/GlassCard";
import { useLanguage } from "../../contexts/LanguageContext";
import { attendanceAPI } from "../../services/api";
import type { AttendanceEvent, AttendanceEventType } from "../../types";
import { Calendar, Clock, RefreshCw, ArrowLeft, ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const AttendanceHistoryScreen: React.FC = () => {
  const { t, isMarathi } = useLanguage();
  const navigate = useNavigate();

  const [records, setRecords] = useState<AttendanceEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const data = await attendanceAPI.getHistory();
      setRecords(data);
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
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

  // Group records by event_date
  const groupedRecords = records.reduce<Record<string, AttendanceEvent[]>>((acc, record) => {
    if (!acc[record.event_date]) {
      acc[record.event_date] = [];
    }
    acc[record.event_date].push(record);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={() => navigate("/dashboard")}
          className="p-2 rounded-xl bg-white/50 border border-white/70 hover:bg-white text-brand-dark transition-all flex items-center gap-1.5 text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <h2 className="text-base font-bold text-brand-dark">{t.history}</h2>

        <button
          onClick={fetchHistory}
          className="p-2 rounded-xl bg-white/50 border border-white/70 hover:bg-white text-brand-muted hover:text-brand-dark transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-xs text-brand-muted font-medium">
          Loading past records...
        </div>
      ) : records.length === 0 ? (
        <GlassCard className="text-center py-10">
          <Clock className="w-10 h-10 text-brand-muted/50 mx-auto mb-2" />
          <h4 className="text-sm font-bold text-brand-dark">No records found</h4>
          <p className="text-xs text-brand-muted mt-1">
            Your attendance scans will appear here chronologically.
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {Object.entries(groupedRecords).map(([dateStr, dayEvents]) => (
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
                    </div>
                    <span className="font-mono font-bold text-brand-muted">
                      {evt.scanned_at_ist}
                    </span>
                  </div>
                ))}
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
};
