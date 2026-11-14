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
  const { isAuthenticated, isAdmin, isSuperAdmin } = useAuth();
  const { t, isMarathi } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const navOptions: SegmentOption<string>[] = [
    {
      value: "/dashboard",
      label: isSuperAdmin ? (isMarathi ? "प्रशासन केंद्र" : "Overview") : t.dashboard,
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
      <div className="w-full max-w-md flex flex-col flex-1 pb-28">
        <Header />
        <main className="flex-1 p-4 flex flex-col">{children}</main>
      </div>

      {/* Seamless Ambient Blur Backdrop near the nav bar with gradient opacity (borderless, no card) */}
      {isAuthenticated && showNav && (
        <div
          className="fixed bottom-0 inset-x-0 h-28 pointer-events-none z-20 backdrop-blur-md bg-gradient-to-t from-white/35 via-white/15 to-transparent [mask-image:linear-gradient(to_top,black_45%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_top,black_45%,transparent_100%)]"
          aria-hidden="true"
        />
      )}

      {/* Standalone Floating Liquid Capsule Navigation Switch */}
      {isAuthenticated && showNav && (
        <nav className="fixed bottom-[max(env(safe-area-inset-bottom),14px)] inset-x-0 z-30 flex justify-center px-4 pointer-events-none">
          <div className="w-full max-w-md pointer-events-auto">
            <IOSSegmentedSwitch<string>
              options={navOptions}
              value={activeValue}
              onChange={(path) => navigate(path)}
              size="nav"
              collapseInactiveLabels={navOptions.length >= 3}
              className="w-full !bg-white/70 !border-white/90 shadow-xl backdrop-blur-2xl"
            />
          </div>
        </nav>
      )}
    </div>
  );
};
