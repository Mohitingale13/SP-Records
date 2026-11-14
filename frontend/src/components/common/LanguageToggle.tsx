import React from "react";
import { useLanguage } from "../../contexts/LanguageContext";

export const LanguageToggle: React.FC = () => {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="inline-flex p-1 rounded-xl bg-white/50 border border-white/70 backdrop-blur-md shadow-sm">
      <button
        onClick={() => setLanguage("en")}
        className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all duration-200 flex items-center gap-1 ${
          language === "en"
            ? "bg-brand-primary text-white shadow-sm"
            : "text-brand-dark/70 hover:text-brand-dark"
        }`}
      >
        <span>English</span>
      </button>
      <button
        onClick={() => setLanguage("mr")}
        className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all duration-200 flex items-center gap-1 font-devanagari ${
          language === "mr"
            ? "bg-brand-primary text-white shadow-sm"
            : "text-brand-dark/70 hover:text-brand-dark"
        }`}
      >
        <span>मराठी</span>
      </button>
    </div>
  );
};
