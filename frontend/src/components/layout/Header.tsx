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
    <header className="sticky top-0 z-30 w-full glass-header px-4 py-2.5 flex items-center justify-between">
      <div
        className="flex items-center gap-2.5 cursor-pointer"
        onClick={() => navigate("/")}
      >
        <div className="relative flex-shrink-0 drop-shadow-sm">
          <ShivamLogo size={42} variant="circle" />
        </div>
        <div>
          <h1 className="text-base font-bold text-brand-dark leading-tight tracking-tight">
            {t.appName}
          </h1>
          <p className="text-[11px] text-brand-muted font-medium">
            {t.appSubtitle}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <LanguageToggle />
        {isAuthenticated && (
          <button
            onClick={logout}
            title={t.logout}
            className="p-2 rounded-xl bg-white/50 border border-white/70 hover:bg-white/80 active:scale-95 text-brand-dark transition-all shadow-sm"
          >
            <LogOut className="w-4 h-4 text-brand-muted" />
          </button>
        )}
      </div>
    </header>
  );
};
