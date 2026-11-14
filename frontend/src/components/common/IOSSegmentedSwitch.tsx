import React from "react";

export interface SegmentOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

interface IOSSegmentedSwitchProps<T extends string = string> {
  options: [SegmentOption<T>, SegmentOption<T>];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md" | "lg";
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
  const isSecond = value === options[1].value;

  const sizeStyles = {
    sm: {
      container: "h-7.5 p-0.5 text-[11px]",
      padding: "px-2 py-0.5",
    },
    md: {
      container: "h-9 p-1 text-xs",
      padding: "px-3 py-1",
    },
    lg: {
      container: "h-11 p-1 text-sm",
      padding: "px-4 py-1.5",
    },
  }[size];

  return (
    <div
      className={`relative inline-flex items-center rounded-full bg-white/40 border border-white/70 backdrop-blur-md shadow-sm select-none p-0.5 ${sizeStyles.container} ${className}`}
      role="radiogroup"
    >
      {/* Sliding iOS 26 Glass Capsule Thumb with Specular White Rim */}
      <div
        className="absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-full transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] pointer-events-none"
        style={{
          transform: isSecond ? "translateX(calc(100% + 2px))" : "translateX(0px)",
        }}
      >
        <div className="w-full h-full rounded-full bg-white/85 backdrop-blur-lg border-[1.5px] border-white shadow-[0_2px_8px_rgba(21,59,67,0.12),inset_0_1px_1.5px_rgba(255,255,255,1)] relative overflow-hidden">
          {/* Subtle specular crescent reflection */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/50 via-transparent to-white/20 pointer-events-none" />
        </div>
      </div>

      {/* Buttons */}
      {options.map((option) => {
        const isSelected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(option.value)}
            className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 font-bold rounded-full transition-colors duration-200 cursor-pointer ${
              sizeStyles.padding
            } ${
              isSelected
                ? "text-brand-dark"
                : "text-brand-muted hover:text-brand-dark"
            }`}
          >
            {option.icon && (
              <span className={`transition-transform duration-200 ${isSelected ? "scale-105 text-brand-primary" : "text-brand-muted"}`}>
                {option.icon}
              </span>
            )}
            <span className="tracking-tight">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
};

