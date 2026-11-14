import React from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import { IOSSegmentedSwitch, type SegmentOption } from "./IOSSegmentedSwitch";
import type { Language } from "../../i18n/translations";

interface LanguageToggleProps {
  compact?: boolean;
  className?: string;
  size?: "sm" | "md";
}

export const LanguageToggle: React.FC<LanguageToggleProps> = ({
  compact = false,
  className = "",
  size = "sm",
}) => {
  const { language, setLanguage } = useLanguage();

  const options: [SegmentOption<Language>, SegmentOption<Language>] = compact
    ? [
        { value: "en", label: "EN" },
        { value: "mr", label: "MR" },
      ]
    : [
        { value: "en", label: "English" },
        { value: "mr", label: "मराठी" },
      ];

  return (
    <IOSSegmentedSwitch<Language>
      options={options}
      value={language}
      onChange={(lang) => setLanguage(lang)}
      size={size}
      className={className}
    />
  );
};
