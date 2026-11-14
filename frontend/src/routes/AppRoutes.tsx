import React, { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { MobileLayout } from "../components/layout/MobileLayout";
import { LoginScreen } from "../features/auth/LoginScreen";
import { StaffDashboard } from "../features/attendance/StaffDashboard";
import { AttendanceHistoryScreen } from "../features/attendance/AttendanceHistoryScreen";
import { AdminDashboard } from "../features/admin/AdminDashboard";
import { QRKioskScreen } from "../features/qr/QRKioskScreen";
import { SplashScreen } from "../components/common/SplashScreen";

const ProtectedRoute: React.FC<{ children: React.ReactNode; adminOnly?: boolean }> = ({
  children,
  adminOnly = false,
}) => {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-xs font-semibold text-brand-dark">
        Initializing Shivam Attendance...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export const AppRoutes: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [splashVisible, setSplashVisible] = useState(true);

  return (
    <>
      {splashVisible && (
        <SplashScreen
          minDisplayTimeMs={isLoading ? 1400 : 1000}
          onFinish={() => setSplashVisible(false)}
        />
      )}

      <Routes>
        <Route
          path="/"
          element={
            isAuthenticated ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <MobileLayout showNav={false}>
                <LoginScreen />
              </MobileLayout>
            )
          }
        />

        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <MobileLayout showNav={false}>
                <LoginScreen />
              </MobileLayout>
            )
          }
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <MobileLayout>
                <StaffDashboard />
              </MobileLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <MobileLayout>
                <AttendanceHistoryScreen />
              </MobileLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute adminOnly>
              <MobileLayout>
                <AdminDashboard />
              </MobileLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/kiosk"
          element={
            <ProtectedRoute adminOnly>
              <MobileLayout showNav={false}>
                <QRKioskScreen />
              </MobileLayout>
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
};
