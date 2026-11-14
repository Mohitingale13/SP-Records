import React from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { LanguageToggle } from "../common/LanguageToggle";
import { ShivamLogo } from "../common/ShivamLogo";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const Header: React.FC = () => {
  const { isAuthenticated, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 w-full glass-header px-4 py-3.5 flex items-center justify-between gap-3 shadow-xs">
      <div
        className="flex items-center gap-2.5 cursor-pointer min-w-0 flex-1 mr-1"
        onClick={() => navigate("/")}
      >
        <div className="relative flex-shrink-0 drop-shadow-sm">
          <ShivamLogo size={44} variant="circle" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-bold text-brand-dark leading-snug tracking-tight truncate">
            {t.appName}
          </h1>
          <p className="text-[11px] text-brand-muted font-medium truncate">
            {t.appSubtitle}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <LanguageToggle compact={isAuthenticated} size="sm" />
        {isAuthenticated && (
          <button
            onClick={logout}
            title={t.logout}
            className="p-2 rounded-full bg-white/55 border border-white/80 hover:bg-white/90 active:scale-95 text-brand-dark transition-all shadow-sm"
          >
            <LogOut className="w-4 h-4 text-brand-muted" />
          </button>
        )}
      </div>
    </header>
  );
};
