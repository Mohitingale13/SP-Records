import React, { useEffect, useState, useRef } from "react";
import QRCode from "qrcode";
import { GlassCard } from "../../components/common/GlassCard";
import { ShivamLogo } from "../../components/common/ShivamLogo";
import { useLanguage } from "../../contexts/LanguageContext";
import { qrAPI } from "../../services/api";
import {
  RefreshCw,
  Shield,
  AlertCircle,
  ArrowLeft,
  Clock,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

export const QRKioskScreen: React.FC = () => {
  const { t, isMarathi } = useLanguage();
  const navigate = useNavigate();

  const [countdown, setCountdown] = useState<number>(20);
  const [error, setError] = useState<string | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Live IST Clock (updates every second)
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      // Format in IST (Asia/Kolkata)
      const timeStr = now.toLocaleTimeString("en-US", {
        timeZone: "Asia/Kolkata",
        hour12: true,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const dateStr = now.toLocaleDateString(isMarathi ? "mr-IN" : "en-IN", {
        timeZone: "Asia/Kolkata",
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      setCurrentTime(timeStr);
      setCurrentDate(dateStr);
    };

    updateClock();
    const clockInterval = setInterval(updateClock, 1000);
    return () => clearInterval(clockInterval);
  }, [isMarathi]);

  const rotateQR = async () => {
    setIsRotating(true);
    setError(null);
    try {
      const data = await qrAPI.rotate();
      setCountdown(data.remaining_seconds || 20);

      // Render to canvas
      if (canvasRef.current && data.token) {
        QRCode.toCanvas(canvasRef.current, data.token, {
          width: 280,
          margin: 1.5,
          color: {
            dark: "#153B43",
            light: "#ffffff",
          },
        });
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to generate rotating QR code.");
    } finally {
      setIsRotating(false);
    }
  };

  useEffect(() => {
    rotateQR();

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          rotateQR();
          return 20;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div className="space-y-4 max-w-md mx-auto text-center py-2 px-1">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/admin")}
          className="p-2 rounded-xl bg-white/50 border border-white/70 hover:bg-white text-brand-dark transition-all flex items-center gap-1.5 text-xs font-semibold shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Admin</span>
        </button>

        <span className="text-xs font-bold text-brand-dark flex items-center gap-1">
          <Shield className="w-3.5 h-3.5 text-brand-primary" />
          <span>{t.appName}</span>
        </span>

        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-white/50 border border-white/70 hover:bg-white text-brand-dark transition-all shadow-sm"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={rotateQR}
            disabled={isRotating}
            className="p-2 rounded-xl bg-white/50 border border-white/70 hover:bg-white text-brand-dark transition-all shadow-sm"
            title={t.kioskRefreshQr}
          >
            <RefreshCw className={`w-4 h-4 ${isRotating ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Main Kiosk Card */}
      <GlassCard className="!p-6 space-y-4 border-brand-primary/40 shadow-2xl relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute -top-12 -right-12 w-36 h-36 bg-brand-primary/20 rounded-full blur-2xl pointer-events-none" />

        {/* Branding & Live Clock Header */}
        <div className="flex items-center justify-center gap-3">
          <div className="p-1 rounded-xl bg-white/70 border border-white/80 shadow-xs">
            <ShivamLogo size={42} />
          </div>
          <div className="text-left">
            <h2 className="text-base font-black text-brand-dark tracking-tight leading-tight">
              {t.appName}
            </h2>
            <p className="text-[11px] font-semibold text-brand-primary uppercase tracking-wider">
              {t.kioskClockTitle}
            </p>
          </div>
        </div>

        {/* Digital IST Clock Display */}
        <div className="py-2 px-4 rounded-xl bg-white/60 border border-white/80 inline-block mx-auto shadow-inner">
          <div className="flex items-center justify-center gap-1.5 text-2xl font-black font-mono tracking-wider text-brand-dark">
            <Clock className="w-5 h-5 text-brand-primary animate-pulse" />
            <span>{currentTime || "--:--:-- --"}</span>
          </div>
          <div className="text-[11px] font-semibold text-brand-muted mt-0.5">
            {currentDate}
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* QR Code Canvas */}
        <div className="relative mx-auto w-72 h-72 rounded-3xl overflow-hidden bg-white p-3 shadow-xl border-2 border-brand-primary/40 flex items-center justify-center">
          <canvas ref={canvasRef} className="w-full h-full object-contain" />
          {isRotating && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-8 h-8 text-brand-primary animate-spin" />
              <span className="text-xs font-bold text-brand-dark">Rotating Token...</span>
            </div>
          )}
        </div>

        {/* Countdown Timer & Security Indicator */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-xs font-bold text-brand-dark px-2">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Live HMAC-SHA256 Token</span>
            </span>
            <span className="font-mono text-brand-primary font-black text-sm">
              {countdown}s
            </span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-brand-dark/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-primary to-brand-secondary transition-all duration-1000 ease-linear rounded-full"
              style={{ width: `${(countdown / 20) * 100}%` }}
            />
          </div>
          <p className="text-[11px] text-brand-muted px-2">
            {t.kioskRotatingNotice}
          </p>
        </div>
      </GlassCard>
    </div>
  );
};
