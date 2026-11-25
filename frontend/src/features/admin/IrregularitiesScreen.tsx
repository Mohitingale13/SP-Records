import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "../../components/common/GlassCard";
import { Button } from "../../components/common/Button";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { adminAPI, attendanceAPI } from "../../services/api";
import type { IrregularityItem, IrregularitiesResponse, AttendanceEventType } from "../../types";
import {
  AlertTriangle,
  Calendar,
  Clock,
  User as UserIcon,
  CheckCircle2,
  ArrowRight,
  Edit2,
  RefreshCw,
  AlertCircle,
  X,
  UserX,
  Flag,
  EyeOff,
} from "lucide-react";
import { ScrollTimePicker } from "../../components/common/ScrollTimePicker";

const EVENT_SHORT_LABELS: Record<string, { en: string; mr: string }> = {
  OFFICE_IN: { en: "In", mr: "आगमन" },
  LUNCH_BREAK_OUT: { en: "Lunch Out", mr: "ब्रेक आउट" },
  LUNCH_BREAK_IN: { en: "Lunch In", mr: "ब्रेक इन" },
  OFFICE_OUT: { en: "Out", mr: "निर्गमन" },
};

export const IrregularitiesScreen: React.FC = () => {
  const { isAdmin } = useAuth();
  const { t, language } = useLanguage();
  const isMarathi = language === "mr";
  const navigate = useNavigate();

  const [irregularities, setIrregularities] = useState<IrregularityItem[]>([]);
  const [counts, setCounts] = useState({
    total: 0,
    missingCheckouts: 0,
    notMarked: 0,
    uncommon: 0,
    reported: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<
    "ALL" | "REPORTED" | "UNCOMMON_TIMESTAMPS" | "MISSING_CHECKOUT" | "NOT_MARKED"
  >("ALL");
  const [actingId, setActingId] = useState<string | null>(null);

  // Adjustment Modal State
  const [adjustItem, setAdjustItem] = useState<IrregularityItem | null>(null);
  const [adjustEventType, setAdjustEventType] = useState<AttendanceEventType>("OFFICE_OUT");
  const [adjustTime, setAdjustTime] = useState("18:00");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSuccess, setAdjustSuccess] = useState<string | null>(null);

  // Mark Absent Modal State
  const [absentItem, setAbsentItem] = useState<IrregularityItem | null>(null);
  const [isSubmittingAbsent, setIsSubmittingAbsent] = useState(false);
  const [absentError, setAbsentError] = useState<string | null>(null);

  const fetchIrregularities = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      const data: IrregularitiesResponse = isAdmin
        ? await adminAPI.getIrregularities(30)
        : await attendanceAPI.getMyIrregularities(30);
      setIrregularities(data.irregularities);
      setCounts({
        total: data.total_irregularities,
        missingCheckouts: data.missing_checkouts_count,
        notMarked: data.not_marked_count,
        uncommon: data.uncommon_timestamps_count ?? 0,
        reported: data.reported_count ?? 0,
      });
    } catch (err) {
      console.error("Failed to load irregularities:", err);
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchIrregularities();
  }, [fetchIrregularities]);

  const filteredItems = irregularities.filter((item) => {
    if (activeFilter === "ALL") return true;
    if (activeFilter === "REPORTED") return item.member_status === "REPORTED";
    return item.type === activeFilter;
  });

  const handleMemberAction = async (item: IrregularityItem, action: "REPORTED" | "IGNORED") => {
    setActingId(item.id);
    try {
      await attendanceAPI.actOnIrregularity({
        irregularity_id: item.id,
        event_date: item.date,
        irregularity_type: item.type,
        action,
      });

      if (action === "IGNORED") {
        setIrregularities((prev) => prev.filter((i) => i.id !== item.id));
        setCounts((prev) => ({
          ...prev,
          total: Math.max(0, prev.total - 1),
        }));
        setAdjustSuccess(
          isMarathi ? "अनियमितता दुर्लक्षित केली गेली." : "Irregularity ignored."
        );
      } else {
        setIrregularities((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, member_status: "REPORTED" } : i))
        );
        setAdjustSuccess(
          isMarathi
            ? "प्रशासनास (Admin) यशस्वीरित्या कळवले गेले."
            : "Reported to Admin for review."
        );
      }
      window.dispatchEvent(new Event("irregularities-updated"));
      setTimeout(() => setAdjustSuccess(null), 4000);
    } catch (err: any) {
      console.error("Failed to submit action:", err);
    } finally {
      setActingId(null);
    }
  };

  const handleOpenDaySettings = (item: IrregularityItem) => {
    // Navigate to Past Records (/history) with Staff Tab, staff member, and date pre-selected
    navigate(`/history?tab=staff&userId=${item.user_id}&date=${item.date}`);
  };

  const handleOpenMarkAbsent = (item: IrregularityItem) => {
    setAbsentItem(item);
    setAbsentError(null);
  };

  const handleConfirmMarkAbsent = async () => {
    if (!absentItem) return;
    setIsSubmittingAbsent(true);
    setAbsentError(null);
    try {
      await adminAPI.markAbsent({
        user_id: absentItem.user_id,
        event_date: absentItem.date,
        reason: "Confirmed absent by administrator",
      });

      // Immediately remove this entry from UI so it vanishes
      setIrregularities((prev) => prev.filter((i) => i.id !== absentItem.id));
      setCounts((prev) => ({
        ...prev,
        total: Math.max(0, prev.total - 1),
        notMarked: absentItem.type === "NOT_MARKED" ? Math.max(0, prev.notMarked - 1) : prev.notMarked,
        missingCheckouts: absentItem.type === "MISSING_CHECKOUT" ? Math.max(0, prev.missingCheckouts - 1) : prev.missingCheckouts,
      }));

      setAdjustSuccess(
        isMarathi
          ? `${absentItem.user_name} यांच्यासाठी गैरहजर नोंद यशस्वीरित्या जतन झाली.`
          : `${absentItem.user_name} marked as Absent. Entry resolved.`
      );
      setAbsentItem(null);
      window.dispatchEvent(new Event("irregularities-updated"));
      setTimeout(() => setAdjustSuccess(null), 4000);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setAbsentError(typeof detail === "string" ? detail : "Failed to mark as absent.");
    } finally {
      setIsSubmittingAbsent(false);
    }
  };

  const handleOpenQuickAdjust = (item: IrregularityItem) => {
    setAdjustItem(item);
    setAdjustError(null);
    if (item.type === "MISSING_CHECKOUT") {
      setAdjustEventType("OFFICE_OUT");
      setAdjustTime("18:00");
    } else {
      setAdjustEventType("OFFICE_IN");
      setAdjustTime("10:00");
    }
  };

  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustItem) return;

    setIsSubmitting(true);
    setAdjustError(null);

    try {
      // Build ISO UTC datetime string for the adjustment
      const [hours, minutes] = adjustTime.split(":");
      const dt = new Date(`${adjustItem.date}T${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}:00+05:30`);

      const existingEvt = adjustItem.events?.find((ev) => ev.event_type === adjustEventType);
      if (existingEvt) {
        await adminAPI.correct({
          record_id: existingEvt.id,
          new_event_type: adjustEventType,
          new_scanned_at: dt.toISOString(),
          reason: "Manual adjustment from Irregularities",
        });
      } else {
        await adminAPI.manualAdd({
          user_id: adjustItem.user_id,
          event_type: adjustEventType,
          event_date: adjustItem.date,
          scanned_at: dt.toISOString(),
          reason: "Manual adjustment from Irregularities",
        });
      }

      setAdjustSuccess(t.adjustmentSuccess);
      setAdjustItem(null);
      await fetchIrregularities(true);
      window.dispatchEvent(new Event("irregularities-updated"));
      setTimeout(() => setAdjustSuccess(null), 4000);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setAdjustError(typeof detail === "string" ? detail : "Failed to save adjustment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Top Header Card */}
      <GlassCard className="!p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-700 flex items-center justify-center shadow-xs">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-brand-dark uppercase tracking-wider">
                {t.irregularities}
              </h1>
              <p className="text-[11px] text-brand-muted font-medium">
                {isAdmin
                  ? isMarathi
                    ? "चुकलेल्या, अपूर्ण किंवा असामान्य वेळेच्या नोंदींची यादी"
                    : "Missed punches, unmarked days & unusual timings"
                  : isMarathi
                  ? "तुमच्या असामान्य किंवा अपूर्ण वेळेच्या नोंदी तपासा"
                  : "Review unusual punch timings or missing punches"}
              </p>
            </div>
          </div>

          <button
            onClick={() => fetchIrregularities(false)}
            disabled={isLoading}
            className="p-2 rounded-xl bg-white/70 border border-brand-dark/15 text-brand-dark hover:bg-white active:scale-95 transition-all shadow-xs"
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-brand-primary ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Overview Metric Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 text-center">
          <button
            type="button"
            onClick={() => setActiveFilter("ALL")}
            className={`p-2.5 rounded-xl border transition-all text-left ${
              activeFilter === "ALL"
                ? "bg-white/95 border-brand-primary/50 shadow-md ring-2 ring-brand-primary/30"
                : "bg-white/60 border-white/80 hover:bg-white/80"
            }`}
          >
            <span className="text-[10px] text-brand-muted font-bold block truncate">
              {isMarathi ? "एकूण समस्या" : "Total Issues"}
            </span>
            <span className="text-lg font-black text-brand-dark">{counts.total}</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveFilter("REPORTED")}
              className={`p-2.5 rounded-xl border transition-all text-left ${
                activeFilter === "REPORTED"
                  ? "bg-rose-500/20 border-rose-500/50 shadow-md ring-2 ring-rose-500/30"
                  : "bg-rose-500/10 border-rose-500/20 hover:bg-rose-500/15"
              }`}
            >
              <span className="text-[10px] text-rose-800 font-bold block truncate">
                {isMarathi ? "कळवलेले" : "Reported"}
              </span>
              <span className="text-lg font-black text-rose-700">{counts.reported}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveFilter("UNCOMMON_TIMESTAMPS")}
            className={`p-2.5 rounded-xl border transition-all text-left ${
              activeFilter === "UNCOMMON_TIMESTAMPS"
                ? "bg-orange-500/20 border-orange-500/50 shadow-md ring-2 ring-orange-500/30"
                : "bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/15"
            }`}
          >
            <span className="text-[10px] text-orange-800 font-bold block truncate">
              {isMarathi ? "असामान्य वेळ" : "Unusual Time"}
            </span>
            <span className="text-lg font-black text-orange-700">{counts.uncommon}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter("MISSING_CHECKOUT")}
            className={`p-2.5 rounded-xl border transition-all text-left ${
              activeFilter === "MISSING_CHECKOUT"
                ? "bg-red-500/20 border-red-500/50 shadow-md ring-2 ring-red-500/30"
                : "bg-red-500/10 border-red-500/20 hover:bg-red-500/15"
            }`}
          >
            <span className="text-[10px] text-red-800 font-bold block truncate">
              {isMarathi ? "चेक-आउट विसरले" : "Missing Exit"}
            </span>
            <span className="text-lg font-black text-red-700">{counts.missingCheckouts}</span>
          </button>

          {!isAdmin && (
            <button
              type="button"
              onClick={() => setActiveFilter("NOT_MARKED")}
              className={`p-2.5 rounded-xl border transition-all text-left ${
                activeFilter === "NOT_MARKED"
                  ? "bg-amber-500/25 border-amber-500/50 shadow-md ring-2 ring-amber-500/30"
                  : "bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/15"
              }`}
            >
              <span className="text-[10px] text-amber-800 font-bold block truncate">
                {isMarathi ? "नोंद नाही / गैरहजर" : "Not Marked"}
              </span>
              <span className="text-lg font-black text-amber-700">{counts.notMarked}</span>
            </button>
          )}
        </div>
      </GlassCard>

      {/* Success Notification */}
      {adjustSuccess && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 text-xs font-bold flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{adjustSuccess}</span>
          </div>
          <button onClick={() => setAdjustSuccess(null)} className="p-1 rounded-full hover:bg-black/10">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Irregularities List */}
      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-brand-muted text-xs font-semibold">
          <RefreshCw className="w-6 h-6 animate-spin text-brand-primary" />
          <span>{isMarathi ? "अनियमितता तपासत आहे..." : "Checking for irregularities across days..."}</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <GlassCard className="!p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-brand-dark">
            {isMarathi ? "सर्व उपस्थिती परिपूर्ण आहेत!" : "All Attendances Complete!"}
          </h3>
          <p className="text-xs text-brand-muted max-w-xs mx-auto">
            {t.noIrregularities}
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <GlassCard
              key={item.id}
              className={`!p-4 space-y-3 transition-all hover:shadow-md ${
                isAdmin && item.member_status === "REPORTED"
                  ? "border-rose-500/60 ring-2 ring-rose-500/25 bg-gradient-to-br from-white/90 via-white/70 to-rose-500/10"
                  : item.severity === "danger"
                  ? "border-red-500/30 bg-gradient-to-br from-white/80 via-white/60 to-red-500/5"
                  : "border-amber-500/30 bg-gradient-to-br from-white/80 via-white/60 to-amber-500/5"
              }`}
            >
              {/* Reported by Member Banner (Admin view) */}
              {isAdmin && item.member_status === "REPORTED" && (
                <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-800 text-[10px] font-extrabold uppercase tracking-wide">
                  <span className="flex items-center gap-1.5">
                    <Flag className="w-3 h-3 text-rose-600" />
                    <span>
                      {isMarathi ? "कर्मचाऱ्याने दुरुस्तीसाठी कळवले" : "Reported by Member"}
                    </span>
                  </span>
                  <span className="text-[9px] font-bold opacity-80">
                    {isMarathi ? "प्राधान्य" : "Action Requested"}
                  </span>
                </div>
              )}

              {/* Card Header: Date & Irregularity Type Badge */}
              <div className="flex items-center justify-between gap-2 border-b border-brand-dark/10 pb-2.5">
                <span className="text-xs font-bold text-brand-dark flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-brand-primary" />
                  <span>{isMarathi ? item.date_formatted_mr : item.date_formatted}</span>
                </span>

                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border flex items-center gap-1 shadow-2xs ${
                    item.severity === "danger"
                      ? "bg-red-500/15 text-red-800 border-red-500/30"
                      : "bg-amber-500/20 text-amber-900 border-amber-500/35"
                  }`}
                >
                  <AlertCircle className="w-3 h-3" />
                  <span>{isMarathi ? item.title_mr : item.title}</span>
                </span>
              </div>

              {/* Employee Info & Irregularity Explanation */}
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1.5 w-full">
                  {isAdmin && (
                    <div className="flex items-center gap-1.5">
                      <UserIcon className="w-3.5 h-3.5 text-brand-muted" />
                      <span className="text-xs font-extrabold text-brand-dark">{item.user_name}</span>
                      <span className="text-[10px] font-bold text-brand-muted">
                        ({item.user_phone.replace(/^\+91/, "")})
                      </span>
                    </div>
                  )}

                  <p className="text-xs font-medium text-brand-dark/85">
                    {isMarathi ? item.description_mr : item.description}
                  </p>

                  {/* Punch timeline chips */}
                  {item.events && item.events.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {item.events.map((ev) => {
                        const lbl = EVENT_SHORT_LABELS[ev.event_type];
                        const shortName = lbl ? (isMarathi ? lbl.mr : lbl.en) : ev.event_type;
                        return (
                          <span
                            key={ev.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/80 border border-brand-dark/10 text-[10px] font-semibold text-brand-dark"
                          >
                            <Clock className="w-2.5 h-2.5 text-brand-primary" />
                            <span>{shortName}:</span>
                            <span className="font-bold">{ev.scanned_at_ist}</span>
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    item.in_time && (
                      <div className="flex items-center gap-2 pt-1 text-[11px] text-brand-muted">
                        <span className="flex items-center gap-1 font-semibold">
                          <Clock className="w-3 h-3 text-emerald-600" />
                          <span>In: {item.in_time}</span>
                        </span>
                        <span>•</span>
                        <span className={item.out_time ? "text-emerald-700 font-semibold" : "text-red-700 font-bold"}>
                          {item.out_time
                            ? `Out: ${item.out_time}`
                            : isMarathi
                            ? "Out: नोंद नाही"
                            : "Out: Missing"}
                        </span>
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              {!isAdmin ? (
                <div className="pt-2 border-t border-brand-dark/10">
                  {item.member_status === "REPORTED" ? (
                    <div className="w-full py-2 px-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 text-xs font-bold flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>
                        {isMarathi
                          ? "प्रशासनास कळवले आहे (Admin Review Pending)"
                          : "Reported to Admin"}
                      </span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="primary"
                        onClick={() => handleMemberAction(item, "REPORTED")}
                        isLoading={actingId === item.id}
                        className="w-full !py-2 text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
                        icon={<Flag className="w-3.5 h-3.5" />}
                      >
                        {isMarathi ? "प्रशासनास कळवा" : "Report to Admin"}
                      </Button>

                      <Button
                        variant="secondary"
                        onClick={() => handleMemberAction(item, "IGNORED")}
                        disabled={actingId === item.id}
                        className="w-full !py-2 text-xs font-bold flex items-center justify-center gap-1.5"
                        icon={<EyeOff className="w-3.5 h-3.5" />}
                      >
                        {isMarathi ? "दुर्लक्ष करा" : "Ignore"}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2 pt-2 border-t border-brand-dark/10">
                  {item.type === "NOT_MARKED" ? (
                    <>
                      <Button
                        variant="danger"
                        onClick={() => handleOpenMarkAbsent(item)}
                        className="w-full !py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center gap-1.5 shadow-sm"
                        icon={<UserX className="w-3.5 h-3.5" />}
                      >
                        {t.markAsAbsent}
                      </Button>

                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => handleOpenQuickAdjust(item)}
                          className="w-full !py-1.5 text-xs font-bold border-brand-primary/40 hover:bg-brand-primary/10 flex items-center justify-center gap-1.5"
                          icon={<Edit2 className="w-3.5 h-3.5 text-brand-primary" />}
                        >
                          {t.quickAdjust}
                        </Button>

                        <Button
                          variant="secondary"
                          onClick={() => handleOpenDaySettings(item)}
                          className="w-full !py-1.5 text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs"
                          icon={<ArrowRight className="w-3.5 h-3.5" />}
                        >
                          {t.openDaySettings}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="primary"
                          onClick={() => handleOpenQuickAdjust(item)}
                          className="w-full !py-1.5 text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
                          icon={<Edit2 className="w-3.5 h-3.5" />}
                        >
                          {t.quickAdjust}
                        </Button>

                        <Button
                          variant="secondary"
                          onClick={() => handleOpenDaySettings(item)}
                          className="w-full !py-1.5 text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs"
                          icon={<ArrowRight className="w-3.5 h-3.5" />}
                        >
                          {t.openDaySettings}
                        </Button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenMarkAbsent(item)}
                        className="w-full py-1 text-[11px] font-semibold text-rose-700 hover:text-rose-900 hover:underline flex items-center justify-center gap-1"
                      >
                        <UserX className="w-3 h-3 text-rose-600" />
                        <span>{isMarathi ? "कर्मचारी गैरहजर होते? गैरहजर नोंदवा" : "Staff was absent? Mark as Absent"}</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      )}

      {/* Quick Adjust Attendance Modal */}
      {adjustItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
          <GlassCard className="w-full max-w-sm relative !p-5 border-white/80 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-brand-dark/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-brand-primary/20 text-brand-primary">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-brand-dark uppercase tracking-wider">
                    {t.adjustTiming}
                  </h3>
                  <p className="text-[11px] text-brand-muted font-medium">
                    {adjustItem.user_name} • {adjustItem.date}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAdjustItem(null)}
                className="p-1.5 rounded-full hover:bg-black/10 text-brand-dark transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {adjustError && (
              <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-800 text-xs font-semibold">
                {adjustError}
              </div>
            )}

            <form onSubmit={handleSubmitAdjustment} className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-brand-muted mb-1">
                  {t.punchType}
                </label>
                <select
                  value={adjustEventType}
                  onChange={(e) => setAdjustEventType(e.target.value as AttendanceEventType)}
                  className="w-full px-2.5 py-2 rounded-lg bg-white/70 border border-brand-dark/20 text-brand-dark font-medium outline-none"
                >
                  <option value="OFFICE_IN">{t.officeIn}</option>
                  <option value="LUNCH_BREAK_OUT">{t.lunchBreakOut}</option>
                  <option value="LUNCH_BREAK_IN">{t.lunchBreakIn}</option>
                  <option value="OFFICE_OUT">{t.officeOut}</option>
                </select>
              </div>

              {/* Infinite Scroll Time Picker Clock */}
              <ScrollTimePicker
                value={adjustTime}
                onChange={setAdjustTime}
                label={t.time}
                isMarathi={isMarathi}
              />

              <div className="flex items-center gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setAdjustItem(null)}
                  className="w-1/2 !py-2 text-xs font-bold"
                >
                  {isMarathi ? "रद्द करा" : "Cancel"}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isSubmitting}
                  className="w-1/2 !py-2 text-xs font-bold"
                >
                  {t.saveAdjustment}
                </Button>
              </div>

              <div className="pt-2 border-t border-brand-dark/10 text-center">
                <button
                  type="button"
                  onClick={() => {
                    const itm = adjustItem;
                    setAdjustItem(null);
                    if (itm) handleOpenMarkAbsent(itm);
                  }}
                  className="text-xs text-rose-700 hover:text-rose-900 font-semibold hover:underline inline-flex items-center gap-1"
                >
                  <UserX className="w-3.5 h-3.5" />
                  <span>{isMarathi ? "किंवा या दिवसासाठी गैरहजर नोंदवा" : "Or mark staff as Absent for this date"}</span>
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      {/* Mark As Absent Modal */}
      {absentItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
          <GlassCard className="w-full max-w-sm relative !p-5 border-white/80 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-brand-dark/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-rose-500/15 text-rose-700 border border-rose-500/30">
                  <UserX className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-brand-dark uppercase tracking-wider">
                    {t.markAsAbsent}
                  </h3>
                  <p className="text-[11px] text-brand-muted font-medium">
                    {absentItem.user_name} • {absentItem.date}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAbsentItem(null)}
                className="p-1.5 rounded-full hover:bg-black/10 text-brand-dark transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {absentError && (
              <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-800 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{absentError}</span>
              </div>
            )}

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 font-medium">
              {t.markAsAbsentConfirm}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAbsentItem(null)}
                className="w-1/2 !py-2 text-xs font-bold"
              >
                {isMarathi ? "रद्द करा" : "Cancel"}
              </Button>
              <Button
                type="button"
                onClick={handleConfirmMarkAbsent}
                isLoading={isSubmittingAbsent}
                className="w-1/2 !py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
              >
                {isMarathi ? "गैरहजर नोंदवा" : "Confirm Absent"}
              </Button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
};
