import React, { useEffect, useRef, useMemo, useCallback } from "react";
import { Clock, ChevronUp, ChevronDown } from "lucide-react";

interface ScrollTimePickerProps {
  value: string; // 24-hour format "HH:mm", e.g. "18:30" or "09:30"
  onChange: (newValue: string) => void;
  label?: string;
  isMarathi?: boolean;
}

const ITEM_HEIGHT = 38; // px per item
const CYCLES = 40; // 40 repeated blocks to enable true infinite continuous scrolling

interface InfiniteDrumColumnProps {
  items: number[];
  selectedValue: number;
  onSelect: (val: number) => void;
  format?: (val: number) => string;
  label: string;
}

const InfiniteDrumColumn: React.FC<InfiniteDrumColumnProps> = ({
  items,
  selectedValue,
  onSelect,
  format = (v) => String(v).padStart(2, "0"),
  label,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const scrollDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const cycleHeight = items.length * ITEM_HEIGHT;
  const middleCycle = Math.floor(CYCLES / 2);

  // Flattened repeated items array
  const repeatedItems = useMemo(() => {
    const list: { key: string; val: number; index: number }[] = [];
    for (let c = 0; c < CYCLES; c++) {
      for (let i = 0; i < items.length; i++) {
        list.push({
          key: `${c}_${i}_${items[i]}`,
          val: items[i],
          index: c * items.length + i,
        });
      }
    }
    return list;
  }, [items]);

  // Center on initial mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const itemIndex = items.indexOf(selectedValue);
    const targetIdx = middleCycle * items.length + (itemIndex >= 0 ? itemIndex : 0);
    container.scrollTop = targetIdx * ITEM_HEIGHT;
  }, []);

  // Sync scroll position when selectedValue changes externally
  useEffect(() => {
    if (isScrollingRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    const currentTop = container.scrollTop;
    const currentItemIndex = Math.round(currentTop / ITEM_HEIGHT);
    const currentVal = items[((currentItemIndex % items.length) + items.length) % items.length];
    if (currentVal === selectedValue) return;

    const itemIdxInCycle = items.indexOf(selectedValue);
    if (itemIdxInCycle < 0) return;
    const currentCycle = Math.floor(currentItemIndex / items.length);
    const targetIdx = currentCycle * items.length + itemIdxInCycle;
    container.scrollTo({ top: targetIdx * ITEM_HEIGHT, behavior: "smooth" });
  }, [selectedValue, items]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    isScrollingRef.current = true;

    // Boundary wrap-around for infinite scroll: jump seamlessly by 15 cycles
    const minScroll = 5 * cycleHeight;
    const maxScroll = (CYCLES - 5) * cycleHeight;
    if (container.scrollTop < minScroll) {
      container.scrollTop += 15 * cycleHeight;
    } else if (container.scrollTop > maxScroll) {
      container.scrollTop -= 15 * cycleHeight;
    }

    if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
    scrollDebounceRef.current = setTimeout(() => {
      isScrollingRef.current = false;
      const finalTop = container.scrollTop;
      const snappedIdx = Math.round(finalTop / ITEM_HEIGHT);
      const val = items[((snappedIdx % items.length) + items.length) % items.length];
      container.scrollTo({ top: snappedIdx * ITEM_HEIGHT, behavior: "smooth" });
      if (val !== selectedValue) {
        onSelect(val);
      }
    }, 110);
  }, [cycleHeight, items, selectedValue, onSelect]);

  const handleItemClick = (index: number, val: number) => {
    const container = containerRef.current;
    if (container) {
      container.scrollTo({ top: index * ITEM_HEIGHT, behavior: "smooth" });
    }
    onSelect(val);
  };

  const stepItem = (direction: -1 | 1) => {
    const currentIdx = items.indexOf(selectedValue);
    const nextIdx = ((currentIdx + direction) % items.length + items.length) % items.length;
    onSelect(items[nextIdx]);
  };

  return (
    <div className="flex flex-col items-center flex-1 min-w-0">
      <span className="text-[10px] font-bold text-brand-muted block text-center pb-1">
        {label}
      </span>

      {/* Up Chevron Stepper */}
      <button
        type="button"
        onClick={() => stepItem(-1)}
        className="p-1 text-brand-muted hover:text-brand-dark hover:bg-black/5 rounded-full transition-colors mb-0.5"
        aria-label={`Previous ${label}`}
      >
        <ChevronUp className="w-3.5 h-3.5" />
      </button>

      {/* Drum Viewport */}
      <div className="relative w-full h-[144px] overflow-hidden rounded-xl bg-white/70 border border-brand-primary/25 shadow-inner">
        {/* Selection Center Lens Highlight */}
        <div
          className="pointer-events-none absolute inset-x-1.5 h-[38px] top-[53px] rounded-lg bg-brand-primary/20 border-y border-brand-primary/40 shadow-xs z-0"
        />

        {/* Top/Bottom Fade Gradients */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white via-white/80 to-transparent z-10" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white via-white/80 to-transparent z-10" />

        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto snap-y snap-mandatory scrollbar-none text-center relative z-2"
          style={{
            scrollbarWidth: "none",
            paddingTop: "53px",
            paddingBottom: "53px",
          }}
        >
          {repeatedItems.map((item) => {
            const isSelected = item.val === selectedValue;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleItemClick(item.index, item.val)}
                className={`w-full h-[38px] flex items-center justify-center font-mono snap-center transition-all ${
                  isSelected
                    ? "font-black text-brand-dark text-base scale-110 drop-shadow-xs"
                    : "font-semibold text-brand-muted/70 hover:text-brand-dark text-xs"
                }`}
              >
                {format(item.val)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Down Chevron Stepper */}
      <button
        type="button"
        onClick={() => stepItem(1)}
        className="p-1 text-brand-muted hover:text-brand-dark hover:bg-black/5 rounded-full transition-colors mt-0.5"
        aria-label={`Next ${label}`}
      >
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

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

  // 12-hour list (loops infinitely: 12, 1, 2, ... 11, 12, 1 ...)
  const hoursList = useMemo(() => [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], []);
  // 60 minutes list (loops infinitely: 00, 01, ... 59, 00, 01 ...)
  const minutesList = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  const displayHour = String(hour12).padStart(2, "0");
  const displayMinute = String(minute).padStart(2, "0");

  return (
    <div className="space-y-2.5">
      {/* Label and Time Readout */}
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
            {period === "PM"
              ? isMarathi
                ? "दुपार / संध्याकाळ"
                : "Afternoon / Evening"
              : isMarathi
              ? "सकाळ"
              : "Morning"}
          </span>
        </div>
      </div>

      {/* 3-Column Infinite Drum Time Wheel */}
      <div className="rounded-2xl bg-white/90 border border-brand-primary/30 p-2.5 shadow-inner">
        <div className="flex items-center gap-2">
          {/* Column 1: Infinite Hours Drum */}
          <InfiniteDrumColumn
            items={hoursList}
            selectedValue={hour12}
            onSelect={(newH) => emitChange(newH, minute, period)}
            label={isMarathi ? "तास (Hour)" : "Hour"}
          />

          {/* Separator */}
          <div className="flex flex-col items-center justify-center text-xl font-black text-brand-primary/60 pb-5">
            :
          </div>

          {/* Column 2: Infinite Minutes Drum */}
          <InfiniteDrumColumn
            items={minutesList}
            selectedValue={minute}
            onSelect={(newM) => emitChange(hour12, newM, period)}
            label={isMarathi ? "मिनिटे (Min)" : "Min"}
          />

          {/* Column 3: AM / PM Switcher */}
          <div className="flex flex-col justify-center gap-2 pt-1 pb-5 w-14 shrink-0">
            <span className="text-[10px] font-bold text-brand-muted block text-center">
              AM/PM
            </span>
            <button
              type="button"
              onClick={() => emitChange(hour12, minute, "AM")}
              className={`py-2 px-1.5 rounded-xl text-xs font-black transition-all ${
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
              className={`py-2 px-1.5 rounded-xl text-xs font-black transition-all ${
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
    </div>
  );
};
