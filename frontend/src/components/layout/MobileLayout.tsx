import React from "react";
import { Header } from "./Header";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useNavigate, useLocation } from "react-router-dom";
import { Calendar, Shield, History } from "lucide-react";
import { IOSSegmentedSwitch, type SegmentOption } from "../common/IOSSegmentedSwitch";

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

  const navOptions: SegmentOption<string>[] = [
    {
      value: "/dashboard",
      label: t.dashboard,
      icon: <Calendar className="w-4 h-4" />,
    },
    {
      value: "/history",
      label: t.history,
      icon: <History className="w-4 h-4" />,
    },
  ];

  if (isAdmin) {
    navOptions.push({
      value: "/admin",
      label: t.adminPanel,
      icon: <Shield className="w-4 h-4" />,
    });
  }

  // Active path fallback for nested/child routes
  const activeValue = navOptions.some((opt) => opt.value === location.pathname)
    ? location.pathname
    : "/dashboard";

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-between relative">
      <div className="w-full max-w-md flex flex-col flex-1 pb-32">
        <Header />
        <main className="flex-1 p-4 flex flex-col">{children}</main>
      </div>

      {/* Persistent Frosted Glass Bottom Navigation Dock */}
      {isAuthenticated && showNav && (
        <nav className="fixed bottom-0 inset-x-0 z-40 flex flex-col items-center pointer-events-none">
          {/* Extended Upper Glass Blur Gradient: Blurs content as it approaches the nav bar */}
          <div className="w-full h-10 bg-gradient-to-t from-white/70 via-white/35 to-transparent backdrop-blur-md pointer-events-none [mask-image:linear-gradient(to_bottom,transparent,black)]" />

          {/* Solid Glass Dock Background: Spans the nav bar and complete bottom safe area */}
          <div className="w-full bg-white/65 backdrop-blur-2xl border-t border-white/75 shadow-[0_-8px_32px_rgba(21,59,67,0.08)] flex justify-center pt-2 pb-[max(env(safe-area-inset-bottom),12px)] pointer-events-auto">
            <div className="w-full max-w-md px-4">
              <IOSSegmentedSwitch<string>
                options={navOptions}
                value={activeValue}
                onChange={(path) => navigate(path)}
                size="nav"
                className="w-full !bg-white/80 !border-white/95 shadow-md backdrop-blur-xl"
              />
            </div>
          </div>
        </nav>
      )}
    </div>
  );
};
