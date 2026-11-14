import React from "react";

interface IOSToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  ariaLabel?: string;
}

export const IOSToggle: React.FC<IOSToggleProps> = ({
  checked,
  onChange,
  disabled = false,
  size = "md",
  className = "",
  ariaLabel = "Toggle",
}) => {
  // Dimensions for sm, md, lg
  const dimensions = {
    sm: {
      track: "w-11 h-6",
      thumb: "w-6 h-5",
      translate: "translate-x-4",
      rim: "border-[2px]",
    },
    md: {
      track: "w-14 h-8",
      thumb: "w-7 h-6",
      translate: "translate-x-6",
      rim: "border-[2.5px]",
    },
    lg: {
      track: "w-16 h-9",
      thumb: "w-8 h-7",
      translate: "translate-x-7",
      rim: "border-[2.5px]",
    },
  }[size];

  const handleToggle = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={handleToggle}
      className={`relative inline-flex items-center rounded-full p-1 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 select-none ${
        dimensions.track
      } ${
        checked
          ? "bg-gradient-to-r from-[#00C7C7] via-[#10C895] to-[#34C759] shadow-[0_2px_10px_rgba(52,199,89,0.35)]"
          : "bg-[#E5E5EA] border border-black/5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer active:scale-95"} ${className}`}
    >
      {/* iOS 26 Glass Capsule Thumb with White Specular Rim */}
      <span
        className={`relative inline-block rounded-full transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          dimensions.thumb
        } ${checked ? dimensions.translate : "translate-x-0"} ${
          checked
            ? "bg-white/40 backdrop-blur-md border-white text-emerald-800"
            : "bg-white/80 backdrop-blur-md border-white/95"
        } ${dimensions.rim} shadow-[0_2px_6px_rgba(0,0,0,0.16),inset_0_1px_2px_rgba(255,255,255,0.9)]`}
      >
        {/* Specular curved highlights on top and bottom of capsule */}
        <span className="absolute inset-0 rounded-full bg-gradient-to-b from-white/40 via-transparent to-white/20 pointer-events-none" />
      </span>
    </button>
  );
};
