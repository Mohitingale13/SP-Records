import React from "react";

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
}

export const IOSSegmentedSwitch = <T extends string = string>({
  options,
  value,
  onChange,
  size = "md",
  className = "",
}: IOSSegmentedSwitchProps<T>) => {
  const selectedIndex = Math.max(
    0,
    options.findIndex((opt) => opt.value === value)
  );

  const numOptions = Math.max(1, options.length);
  const widthPercent = 100 / numOptions;

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
      padding: "px-3 py-1.5",
    },
  }[size];

  return (
    <div
      className={`relative inline-flex items-center rounded-full bg-white/45 border border-white/75 backdrop-blur-xl shadow-sm select-none ${sizeStyles.container} ${className}`}
      role="radiogroup"
    >
      {/* Sliding iOS 26 Glass Capsule Thumb with Specular White Rim */}
      <div
        className="absolute top-1 bottom-1 rounded-full transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] pointer-events-none"
        style={{
          width: `calc(${widthPercent}% - 4px)`,
          left: `calc(${selectedIndex * widthPercent}% + 2px)`,
        }}
      >
        <div className="w-full h-full rounded-full bg-white/90 backdrop-blur-xl border-[1.5px] border-white shadow-[0_2px_10px_rgba(21,59,67,0.12),inset_0_1px_1.5px_rgba(255,255,255,1)] relative overflow-hidden">
          {/* Subtle specular crescent reflection gloss */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/60 via-transparent to-white/15 pointer-events-none" />
        </div>
      </div>

      {/* Segment Buttons */}
      {options.map((option) => {
        const isSelected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(option.value)}
            className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 font-bold rounded-full transition-all duration-200 cursor-pointer ${
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
