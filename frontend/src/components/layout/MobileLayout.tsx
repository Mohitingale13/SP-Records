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
    <div className="min-h-screen flex flex-col items-center justify-between">
      <div className="w-full max-w-md flex flex-col flex-1 pb-24">
        <Header />
        <main className="flex-1 p-4 flex flex-col">{children}</main>
      </div>

      {/* Floating Bottom Navigation Bar with iOS Liquid Capsule Switch */}
      {isAuthenticated && showNav && (
        <nav className="fixed bottom-3.5 z-30 w-full max-w-md px-4">
          <div className="w-full">
            <IOSSegmentedSwitch<string>
              options={navOptions}
              value={activeValue}
              onChange={(path) => navigate(path)}
              size="nav"
              className="w-full !bg-white/65 !border-white/85 shadow-xl backdrop-blur-2xl"
            />
          </div>
        </nav>
      )}
    </div>
  );
};
