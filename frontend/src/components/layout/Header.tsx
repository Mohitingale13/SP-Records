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
    <header className="sticky top-0 z-30 w-full glass-header px-3.5 py-2 flex items-center justify-between gap-2">
      <div
        className="flex items-center gap-2 cursor-pointer min-w-0 flex-1 mr-1"
        onClick={() => navigate("/")}
      >
        <div className="relative flex-shrink-0 drop-shadow-sm">
          <ShivamLogo size={36} variant="circle" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-bold text-brand-dark leading-tight tracking-tight truncate">
            {t.appName}
          </h1>
          <p className="text-[10px] text-brand-muted font-medium truncate">
            {t.appSubtitle}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <LanguageToggle compact={isAuthenticated} size="sm" />
        {isAuthenticated && (
          <button
            onClick={logout}
            title={t.logout}
            className="p-1.5 rounded-full bg-white/50 border border-white/70 hover:bg-white/80 active:scale-95 text-brand-dark transition-all shadow-sm"
          >
            <LogOut className="w-3.5 h-3.5 text-brand-muted" />
          </button>
        )}
      </div>
    </header>
  );
};
