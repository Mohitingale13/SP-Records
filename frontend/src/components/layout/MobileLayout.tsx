import React from "react";
import { Header } from "./Header";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useNavigate, useLocation } from "react-router-dom";
import { Calendar, Shield, History } from "lucide-react";

interface MobileLayoutProps {
  children: React.ReactNode;
  showNav?: boolean;
}

export const MobileLayout: React.FC<MobileLayoutProps> = ({
  children,
  showNav = true,
}) => {
  const { isAuthenticated, isAdmin } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    {
      path: "/dashboard",
      label: t.dashboard,
      icon: <Calendar className="w-5 h-5" />,
    },
    {
      path: "/history",
      label: t.history,
      icon: <History className="w-5 h-5" />,
    },
  ];

  if (isAdmin) {
    navItems.push({
      path: "/admin",
      label: t.adminPanel,
      icon: <Shield className="w-5 h-5" />,
    });
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-between">
      <div className="w-full max-w-md flex flex-col flex-1 pb-24">
        <Header />
        <main className="flex-1 p-4 flex flex-col">{children}</main>
      </div>

      {/* Floating Bottom Navigation Bar for Mobile */}
      {isAuthenticated && showNav && (
        <nav className="fixed bottom-3 z-30 w-full max-w-md px-4">
          <div className="glass-card !p-2 flex items-center justify-around shadow-xl border-white/80 bg-white/70">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl transition-all duration-200 ${
                    isActive
                      ? "text-brand-primary font-bold bg-white/80 shadow-sm"
                      : "text-brand-muted hover:text-brand-dark"
                  }`}
                >
                  {item.icon}
                  <span className="text-[11px]">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
};
