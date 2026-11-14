import React from "react";
import { CheckCircle2, Clock, Coffee, AlertCircle } from "lucide-react";
import type { AttendanceStatus } from "../../types";
import { useLanguage } from "../../contexts/LanguageContext";

interface BadgeProps {
  status: AttendanceStatus | string;
  size?: "sm" | "md";
}

export const StatusBadge: React.FC<BadgeProps> = ({ status, size = "md" }) => {
  const { t } = useLanguage();

  let config = {
    label: t.statusNotStarted,
    color: "bg-slate-500/15 text-slate-700 border-slate-300/60",
    icon: <Clock className="w-3.5 h-3.5" />,
  };

  switch (status) {
    case "CHECKED_IN":
      config = {
        label: t.statusCheckedIn,
        color: "bg-emerald-500/20 text-emerald-800 border-emerald-400/50",
        icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />,
      };
      break;
    case "ON_LUNCH_BREAK":
      config = {
        label: t.statusOnLunch,
        color: "bg-amber-500/20 text-amber-800 border-amber-400/50",
        icon: <Coffee className="w-3.5 h-3.5 text-amber-600" />,
      };
      break;
    case "RETURNED_FROM_LUNCH":
      config = {
        label: t.statusReturnedLunch,
        color: "bg-teal-500/20 text-teal-800 border-teal-400/50",
        icon: <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />,
      };
      break;
    case "COMPLETED":
      config = {
        label: t.statusCompleted,
        color: "bg-blue-500/20 text-blue-800 border-blue-400/50",
        icon: <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />,
      };
      break;
    case "NOT_STARTED":
    default:
      config = {
        label: t.statusNotStarted,
        color: "bg-gray-500/15 text-gray-700 border-gray-300/60",
        icon: <AlertCircle className="w-3.5 h-3.5 text-gray-500" />,
      };
      break;
  }

  const padding = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border backdrop-blur-md shadow-sm ${config.color} ${padding}`}
    >
      {config.icon}
      <span>{config.label}</span>
    </span>
  );
};
