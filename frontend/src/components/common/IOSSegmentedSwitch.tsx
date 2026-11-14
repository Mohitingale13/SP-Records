import React, { useRef, useState, useLayoutEffect } from "react";

export interface SegmentOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

interface IOSSegmentedSwitchProps<T extends string = string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md" | "lg" | "nav";
  className?: string;
  activeColor?: string;
  collapseInactiveLabels?: boolean;
}

export const IOSSegmentedSwitch = <T extends string = string>({
  options,
  value,
  onChange,
  size = "md",
  className = "",
  collapseInactiveLabels,
}: IOSSegmentedSwitchProps<T>) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedIndex = Math.max(
    0,
    options.findIndex((opt) => opt.value === value)
  );

  const numOptions = Math.max(1, options.length);
  const widthPercent = 100 / numOptions;

  const shouldCollapse =
    collapseInactiveLabels !== undefined
      ? collapseInactiveLabels
      : size === "nav" && options.length >= 3;

  const [thumbRect, setThumbRect] = useState<{ left: number; width: number } | null>(null);

  // Measure active button offset & width for dynamic sliding capsule
  useLayoutEffect(() => {
    const updateThumb = () => {
      const activeBtn = buttonRefs.current[selectedIndex];
      const container = containerRef.current;
      if (activeBtn && container) {
        const activeRect = activeBtn.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const left = activeRect.left - containerRect.left;
        const width = activeRect.width;
        if (width > 0) {
          setThumbRect({ left, width });
        }
      }
    };

    updateThumb();

    // Use requestAnimationFrame for settling dynamic CSS transitions
    const frameId = requestAnimationFrame(updateThumb);

    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      const ro = new ResizeObserver(() => {
        updateThumb();
      });
      ro.observe(containerRef.current);
      buttonRefs.current.forEach((btn) => {
        if (btn) ro.observe(btn);
      });
      return () => {
        cancelAnimationFrame(frameId);
        ro.disconnect();
      };
    } else {
      window.addEventListener("resize", updateThumb);
      return () => {
        cancelAnimationFrame(frameId);
        window.removeEventListener("resize", updateThumb);
      };
    }
  }, [selectedIndex, options, value, shouldCollapse]);

  const sizeStyles = {
    sm: {
      container: "h-8 p-0.5 text-[11px]",
      padding: "px-2 py-0.5",
    },
    md: {
      container: "h-9.5 p-1 text-xs",
      padding: "px-3 py-1",
    },
    lg: {
      container: "h-11.5 p-1 text-sm",
      padding: "px-4 py-1.5",
    },
    nav: {
      container: "h-12 p-1 text-xs",
      padding: "px-2.5 py-1.5",
    },
  }[size];

  // Dynamic thumb positioning with graceful fallback
  const thumbStyle: React.CSSProperties = thumbRect
    ? {
        left: `${thumbRect.left}px`,
        width: `${thumbRect.width}px`,
      }
    : {
        width: `calc(${widthPercent}% - 4px)`,
        left: `calc(${selectedIndex * widthPercent}% + 2px)`,
      };

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center rounded-full bg-white/45 border border-white/75 backdrop-blur-xl shadow-sm select-none ${sizeStyles.container} ${className}`}
      role="radiogroup"
    >
      {/* Sliding iOS 26 Glass Capsule Thumb with Specular White Rim */}
      <div
        className="absolute top-1 bottom-1 rounded-full transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] pointer-events-none z-0"
        style={thumbStyle}
      >
        <div className="w-full h-full rounded-full bg-white/95 backdrop-blur-xl border-[1.5px] border-white shadow-[0_2px_12px_rgba(21,59,67,0.14),inset_0_1px_1.5px_rgba(255,255,255,1)] relative overflow-hidden">
          {/* Subtle specular crescent reflection gloss */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-transparent to-white/20 pointer-events-none" />
        </div>
      </div>

      {/* Segment Buttons */}
      {options.map((option, index) => {
        const isSelected = value === option.value;
        const labelString = typeof option.label === "string" ? option.label : undefined;

        if (shouldCollapse) {
          return (
            <button
              key={option.value}
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              title={labelString}
              aria-label={labelString}
              onClick={() => onChange(option.value)}
              className={`relative z-10 flex items-center justify-center font-bold rounded-full transition-all duration-300 cursor-pointer h-full ${
                sizeStyles.padding
              } ${
                isSelected
                  ? "flex-1 min-w-0 text-brand-dark px-3"
                  : "flex-none w-11 sm:w-12 text-brand-muted hover:text-brand-dark hover:bg-white/20 active:scale-95"
              }`}
            >
              {option.icon && (
                <span
                  className={`transition-all duration-300 shrink-0 ${
                    isSelected ? "scale-110 text-brand-primary" : "text-brand-muted"
                  }`}
                >
                  {option.icon}
                </span>
              )}
              {isSelected ? (
                <span className="tracking-tight truncate ml-1.5 transition-all duration-300 opacity-100 max-w-[170px] inline-block animate-fadeIn">
                  {option.label}
                </span>
              ) : (
                <span className="sr-only">{option.label}</span>
              )}
            </button>
          );
        }

        return (
          <button
            key={option.value}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(option.value)}
            className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 font-bold rounded-full transition-all duration-200 cursor-pointer h-full ${
              sizeStyles.padding
            } ${
              isSelected
                ? "text-brand-dark scale-[1.01]"
                : "text-brand-muted hover:text-brand-dark"
            }`}
          >
            {option.icon && (
              <span
                className={`transition-transform duration-200 shrink-0 ${
                  isSelected ? "scale-110 text-brand-primary" : "text-brand-muted"
                }`}
              >
                {option.icon}
              </span>
            )}
            <span className="tracking-tight truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
};
