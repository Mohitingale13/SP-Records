import React, { useEffect, useRef } from "react";
import { Clock } from "lucide-react";

interface ScrollTimePickerProps {
  value: string; // 24-hour format "HH:mm", e.g. "18:30" or "09:30"
  onChange: (newValue: string) => void;
  label?: string;
  isMarathi?: boolean;
}

export const ScrollTimePicker: React.FC<ScrollTimePickerProps> = ({
  value,
  onChange,
  label,
  isMarathi = false,
}) => {
  // Parse incoming 24-hour "HH:mm" into 12-hour components
  const parse24h = (timeStr: string) => {
    const [hStr, mStr] = (timeStr || "09:30").split(":");
    let h = parseInt(hStr, 10);
    let m = parseInt(mStr, 10);
    if (isNaN(h)) h = 9;
    if (isNaN(m)) m = 30;

    const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return { hour12, minute: m, period };
  };

  const { hour12, minute, period } = parse24h(value);

  // Convert 12-hour components back into 24-hour "HH:mm" string
  const emitChange = (newHour12: number, newMinute: number, newPeriod: "AM" | "PM") => {
    let h24 = newHour12;
    if (newPeriod === "PM" && newHour12 < 12) h24 += 12;
    if (newPeriod === "AM" && newHour12 === 12) h24 = 0;
    const formatted = `${String(h24).padStart(2, "0")}:${String(newMinute).padStart(2, "0")}`;
    onChange(formatted);
  };

  // Preset bank operational attendance shifts
  const quickPresets = [
    { label: isMarathi ? "आगमन ०९:३० AM" : "Morning 09:30 AM", h24: "09:30" },
    { label: isMarathi ? "जेवण ०१:३० PM" : "Lunch Out 01:30 PM", h24: "13:30" },
    { label: isMarathi ? "पुन्हा ०२:०० PM" : "Lunch In 02:00 PM", h24: "14:00" },
    { label: isMarathi ? "निर्गमन ०६:३० PM" : "Office Out 06:30 PM", h24: "18:30" },
  ];

  const hoursList = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const minutesList = Array.from({ length: 60 }, (_, i) => i);

  // Refs for auto-centering selected items in scroll containers
  const hourContainerRef = useRef<HTMLDivElement>(null);
  const minuteContainerRef = useRef<HTMLDivElement>(null);
  const selectedHourRef = useRef<HTMLButtonElement>(null);
  const selectedMinuteRef = useRef<HTMLButtonElement>(null);

  // Scroll active numbers into view smoothly
  useEffect(() => {
    if (selectedHourRef.current && hourContainerRef.current) {
      selectedHourRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [hour12]);

  useEffect(() => {
    if (selectedMinuteRef.current && minuteContainerRef.current) {
      selectedMinuteRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [minute]);

  const displayHour = String(hour12).padStart(2, "0");
  const displayMinute = String(minute).padStart(2, "0");

  return (
    <div className="space-y-2.5">
      {/* Label and Big Crisp Current Time Readout */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-brand-dark flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-brand-primary" />
          <span>{label || (isMarathi ? "वेळ निवडा (घड्याळ)" : "Select Time")}</span>
        </label>
        <span className="text-[10px] text-brand-muted font-medium bg-brand-primary/10 px-2 py-0.5 rounded-full">
          IST (भारतीय प्रमाणवेळ)
        </span>
      </div>

      {/* Selected Time Banner */}
      <div className="p-2.5 rounded-xl bg-gradient-to-r from-teal-500/10 via-brand-primary/15 to-teal-500/10 border border-brand-primary/30 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2">
          <div className="text-xl sm:text-2xl font-black font-mono tracking-wider text-brand-dark">
            {displayHour} : {displayMinute}
          </div>
          <span
            className={`px-2 py-0.5 rounded-md text-xs font-black tracking-wide ${
              period === "PM"
                ? "bg-amber-500 text-white shadow-xs"
                : "bg-teal-600 text-white shadow-xs"
            }`}
          >
            {period}
          </span>
        </div>
        <div className="text-right">
          <span className="text-[11px] font-bold text-brand-dark block font-mono">
            {value} (24h)
          </span>
          <span className="text-[9px] text-brand-muted font-medium">
            {period === "PM" ? (isMarathi ? "दुपार / संध्याकाळ" : "Afternoon / Evening") : (isMarathi ? "सकाळ" : "Morning")}
          </span>
        </div>
      </div>

      {/* 3-Column Scroll Wheel Picker */}
      <div className="relative rounded-2xl bg-white/90 border border-brand-primary/30 p-2 shadow-inner overflow-hidden">
        {/* Subtle drum overlay gradients */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-white via-white/80 to-transparent z-10" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-white via-white/80 to-transparent z-10" />

        <div className="grid grid-cols-7 gap-1 items-center">
          {/* Column 1: Hour (3 cols) */}
          <div className="col-span-3">
            <span className="text-[10px] font-bold text-brand-muted block text-center pb-1">
              {isMarathi ? "तास (Hour)" : "Hour"}
            </span>
            <div
              ref={hourContainerRef}
              className="h-32 overflow-y-auto snap-y snap-mandatory scrollbar-none space-y-1 py-2 text-center"
              style={{ scrollbarWidth: "none" }}
            >
              {hoursList.map((h) => {
                const isSelected = h === hour12;
                return (
                  <button
                    key={h}
                    type="button"
                    ref={isSelected ? selectedHourRef : null}
                    onClick={() => emitChange(h, minute, period)}
                    className={`w-full py-1.5 rounded-lg text-sm font-bold font-mono snap-center transition-all ${
                      isSelected
                        ? "bg-brand-primary text-white shadow-md scale-105 font-black"
                        : "text-brand-muted hover:text-brand-dark hover:bg-black/5"
                    }`}
                  >
                    {String(h).padStart(2, "0")}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Separator (1 col) */}
          <div className="col-span-1 flex flex-col items-center justify-center text-lg font-black text-brand-primary/50">
            :
          </div>

          {/* Column 2: Minute (2 cols) */}
          <div className="col-span-2">
            <span className="text-[10px] font-bold text-brand-muted block text-center pb-1">
              {isMarathi ? "मिनिटे (Min)" : "Min"}
            </span>
            <div
              ref={minuteContainerRef}
              className="h-32 overflow-y-auto snap-y snap-mandatory scrollbar-none space-y-1 py-2 text-center"
              style={{ scrollbarWidth: "none" }}
            >
              {minutesList.map((m) => {
                const isSelected = m === minute;
                return (
                  <button
                    key={m}
                    type="button"
                    ref={isSelected ? selectedMinuteRef : null}
                    onClick={() => emitChange(hour12, m, period)}
                    className={`w-full py-1.5 rounded-lg text-sm font-bold font-mono snap-center transition-all ${
                      isSelected
                        ? "bg-brand-primary text-white shadow-md scale-105 font-black"
                        : "text-brand-muted hover:text-brand-dark hover:bg-black/5"
                    }`}
                  >
                    {String(m).padStart(2, "0")}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Column 3: AM / PM (1 col) */}
          <div className="col-span-1 flex flex-col justify-center gap-2 pt-3">
            <button
              type="button"
              onClick={() => emitChange(hour12, minute, "AM")}
              className={`py-2 px-1 rounded-xl text-xs font-black transition-all ${
                period === "AM"
                  ? "bg-teal-600 text-white shadow-md scale-105"
                  : "bg-black/5 text-brand-muted hover:bg-black/10 hover:text-brand-dark"
              }`}
            >
              AM
            </button>
            <button
              type="button"
              onClick={() => emitChange(hour12, minute, "PM")}
              className={`py-2 px-1 rounded-xl text-xs font-black transition-all ${
                period === "PM"
                  ? "bg-amber-500 text-white shadow-md scale-105"
                  : "bg-black/5 text-brand-muted hover:bg-black/10 hover:text-brand-dark"
              }`}
            >
              PM
            </button>
          </div>
        </div>
      </div>

      {/* Quick 1-Tap Bank Shift Presets */}
      <div className="space-y-1 pt-1">
        <span className="text-[10px] font-bold text-brand-muted block">
          {isMarathi ? "जलद निवडी (Quick Presets):" : "Quick Shift Presets:"}
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          {quickPresets.map((preset) => (
            <button
              key={preset.h24}
              type="button"
              onClick={() => onChange(preset.h24)}
              className={`px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all border text-left flex items-center justify-between ${
                value === preset.h24
                  ? "bg-brand-primary text-white border-brand-primary shadow-xs"
                  : "bg-white/70 text-brand-dark border-brand-primary/20 hover:bg-brand-primary/10"
              }`}
            >
              <span>{preset.label}</span>
              {value === preset.h24 && <span>✓</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

