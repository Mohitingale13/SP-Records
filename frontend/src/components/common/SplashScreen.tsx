import React, { useEffect, useState } from "react";
import { ShivamLogo } from "./ShivamLogo";
import { useLanguage } from "../../contexts/LanguageContext";

interface SplashScreenProps {
  onFinish?: () => void;
  minDisplayTimeMs?: number;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onFinish,
  minDisplayTimeMs = 1200,
}) => {
  const { language } = useLanguage();
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFading(true);
      const exitTimer = setTimeout(() => {
        onFinish?.();
      }, 400);
      return () => clearTimeout(exitTimer);
    }, minDisplayTimeMs);

    return () => clearTimeout(timer);
  }, [minDisplayTimeMs, onFinish]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-400 ${fading ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      style={{
        background: "linear-gradient(135deg, #B8F2EC 0%, #D9FAF5 50%, #C4F7F2 100%)",
      }}
    >
      <div className="flex flex-col items-center animate-fade-in px-6 text-center max-w-xs">
        {/* Glowing Logo Container */}
        <div className="relative mb-6">
          <div className="absolute -inset-3 bg-brand-primary/25 rounded-3xl blur-xl animate-pulse" />
          <div className="relative p-3 rounded-2xl glass-card border border-white/60 shadow-lg">
            <ShivamLogo size={80} />
          </div>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-brand-dark mb-1">
          {language === "mr" ? "शिवम पतसंस्था" : "Shivam Patsanstha"}
        </h1>
        <p className="text-xs font-semibold text-brand-primary tracking-wide uppercase mb-3">
          {language === "mr" ? "डिजिटल उपस्थिती प्रणाली" : "Digital Attendance System"}
        </p>

        <div className="flex items-center gap-2 mt-4">
          <div className="w-2 h-2 rounded-full bg-brand-primary animate-bounce [animation-delay:-0.3s]" />
          <div className="w-2 h-2 rounded-full bg-brand-primary animate-bounce [animation-delay:-0.15s]" />
          <div className="w-2 h-2 rounded-full bg-brand-primary animate-bounce" />
        </div>

        <p className="text-[11px] text-brand-muted mt-4">
          {language === "mr" ? "सुरक्षित • पारदर्शक • स्वयंचलित" : "Secure • Transparent • Instant"}
        </p>
      </div>
    </div>
  );
};
