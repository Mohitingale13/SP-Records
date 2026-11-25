import React, { useEffect, useState } from "react";
import { Header } from "./Header";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useNavigate, useLocation } from "react-router-dom";
import { Calendar, Shield, History, AlertTriangle, QrCode } from "lucide-react";
import { adminAPI, attendanceAPI } from "../../services/api";

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

  const [irregularityCount, setIrregularityCount] = useState(0);
  const [reportedCount, setReportedCount] = useState(0);
  const [memberPendingCount, setMemberPendingCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) return;
    let isMounted = true;

    const loadCounts = () => {
      if (isAdmin) {
        adminAPI
          .getIrregularities(30)
          .then((data) => {
            if (isMounted) {
              setIrregularityCount(data.total_irregularities ?? 0);
              setReportedCount(data.reported_count ?? 0);
            }
          })
          .catch(() => {});
      } else {
        attendanceAPI
          .getMyIrregularities(30)
          .then((data) => {
            if (isMounted) {
              setMemberPendingCount(data.pending_count ?? data.total_irregularities ?? 0);
            }
          })
          .catch(() => {});
      }
    };

    loadCounts();
    window.addEventListener("irregularities-updated", loadCounts);

    return () => {
      isMounted = false;
      window.removeEventListener("irregularities-updated", loadCounts);
    };
  }, [isAuthenticated, isAdmin, location.pathname]);

  const navOptions = [
    {
      value: "/dashboard",
      label: isSuperAdmin
        ? isMarathi
          ? "प्रशासन केंद्र"
          : "Overview"
        : isAdmin
        ? t.dashboard
        : isMarathi
        ? "QR"
        : "QR",
      icon: isAdmin ? <Calendar className="w-4.5 h-4.5" /> : <QrCode className="w-4.5 h-4.5" />,
    },
    {
      value: "/history",
      label: t.history,
      icon: <History className="w-4.5 h-4.5" />,
    },
    // Irregularities tab placed at the 3rd place for both members and admins
    {
      value: "/irregularities",
      label: t.irregularities,
      icon: <AlertTriangle className="w-4.5 h-4.5" />,
    },
  ];

  if (isAdmin) {
    // Admin Panel at 4th place
    navOptions.push({
      value: "/admin",
      label: t.adminPanel,
      icon: <Shield className="w-4.5 h-4.5" />,
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

      {/* Seamless Ambient Blur Backdrop near the nav bar with gradient opacity */}
      {isAuthenticated && showNav && (
        <div
          className="fixed bottom-0 inset-x-0 h-28 pointer-events-none z-20 backdrop-blur-md bg-gradient-to-t from-white/35 via-white/15 to-transparent [mask-image:linear-gradient(to_top,black_45%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_top,black_45%,transparent_100%)]"
          aria-hidden="true"
        />
      )}

      {/* Modern Standard Mobile Navigation Dock: Icon-only when unselected, Icon + Label when clicked */}
      {isAuthenticated && showNav && (
        <nav className="fixed bottom-[max(env(safe-area-inset-bottom),14px)] inset-x-0 z-30 flex justify-center px-4 pointer-events-none">
          <div className="w-full max-w-md pointer-events-auto bg-white/85 backdrop-blur-2xl border border-white/90 shadow-[0_8px_32px_rgba(21,59,67,0.16)] rounded-full p-1.5 flex items-center justify-around">
            {navOptions.map((opt) => {
              const isSelected = activeValue === opt.value;
              const isIrregTab = opt.value === "/irregularities";
              const powerCount = isIrregTab
                ? isAdmin
                  ? reportedCount
                  : memberPendingCount
                : 0;
              const hasDotBadge =
                isIrregTab && isAdmin && powerCount === 0 && irregularityCount > 0 && !isSelected;

              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => navigate(opt.value)}
                  className={`relative flex items-center justify-center rounded-full transition-all duration-300 cursor-pointer h-10 ${
                    isSelected
                      ? "bg-brand-primary/20 text-brand-dark px-4 font-bold border border-brand-primary/35 shadow-xs"
                      : "w-11 text-brand-muted hover:text-brand-dark hover:bg-white/40 active:scale-95"
                  }`}
                  title={typeof opt.label === "string" ? opt.label : undefined}
                  aria-label={typeof opt.label === "string" ? opt.label : undefined}
                >
                  <span
                    className={`relative shrink-0 transition-transform duration-300 ${
                      isSelected ? "text-brand-primary scale-110" : "text-brand-muted"
                    }`}
                  >
                    {opt.icon}

                    {/* Superscript / power count badge (1, 2, ...) for reported/pending irregularities */}
                    {powerCount > 0 && (
                      <span
                        className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-rose-600 text-white text-[9px] font-black leading-none flex items-center justify-center shadow-sm ring-1 ring-white"
                        aria-label={`${powerCount} irregularities`}
                      >
                        {powerCount > 9 ? "9+" : powerCount}
                      </span>
                    )}

                    {/* Subtle red indicator dot for unraised admin irregularities */}
                    {hasDotBadge && (
                      <span className="absolute -top-0.5 -right-1 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                      </span>
                    )}
                  </span>

                  {/* Show name ONLY when clicked/selected */}
                  {isSelected && (
                    <span className="text-xs font-bold tracking-tight truncate max-w-[130px] ml-1.5 inline-block animate-fadeIn">
                      {opt.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
};
