import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import confetti from "canvas-confetti";
import { GlassCard } from "../../components/common/GlassCard";
import { Button } from "../../components/common/Button";
import { useLanguage } from "../../contexts/LanguageContext";
import { attendanceAPI } from "../../services/api";
import { X, AlertCircle, QrCode, MapPin, ShieldCheck, Loader2 } from "lucide-react";
import type { AttendanceEvent, ScanLocationPayload } from "../../types";

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (event: AttendanceEvent) => void;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stepMessage, setStepMessage] = useState<string>("");
  const [manualToken, setManualToken] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const qrRegionId = "sp-qr-reader";

  const restartScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (text) => handleScannedToken(text),
          () => {}
        );
      } catch {}
    }
  };

  const handleScannedToken = async (token: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setError(null);
    setStepMessage(t.locationAcquiring);

    // Stop camera immediately to prevent multiple scans
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
      } catch {}
    }

    // Step 1: Verify browser geolocation support
    if (!navigator.geolocation) {
      setError(t.locationNotSupported);
      setIsProcessing(false);
      restartScanner();
      return;
    }

    // Step 2: Request High Accuracy GPS Position
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const location_timestamp = new Date(pos.timestamp).toISOString();

        // Check reported accuracy threshold (100m maximum acceptable)
        if (accuracy > 100) {
          setError(
            `${t.locationAccuracyWarning} (±${Math.round(accuracy)}m > 100m)`
          );
          setIsProcessing(false);
          restartScanner();
          return;
        }

        setStepMessage(t.locationVerifying);

        try {
          const payload: ScanLocationPayload = {
            qr_token: token.trim(),
            latitude,
            longitude,
            accuracy,
            location_timestamp,
          };

          const event = await attendanceAPI.scan(payload);

          // Celebrate with confetti
          confetti({
            particleCount: 80,
            spread: 60,
            origin: { y: 0.6 },
            colors: ["#00C7C7", "#36BFCB", "#B8F2EC", "#ffffff"],
          });
          onSuccess(event);
          onClose();
        } catch (err: any) {
          const msg =
            err.response?.data?.detail || "Scan failed. Please verify you are at Shivam Patsanstha office and retry.";
          setError(msg);
          setIsProcessing(false);
          restartScanner();
        }
      },
      (geoErr) => {
        let errMsg = t.locationTimeout;
        if (geoErr.code === geoErr.PERMISSION_DENIED) {
          errMsg = t.locationPermissionDenied;
        } else if (geoErr.code === geoErr.POSITION_UNAVAILABLE) {
          errMsg = "GPS position unavailable. Please ensure location services are enabled on your device.";
        }
        setError(errMsg);
        setIsProcessing(false);
        restartScanner();
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      }
    );
  };

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setError(null);
    setIsProcessing(false);
    setStepMessage("");

    const startScanner = async () => {
      try {
        const scanner = new Html5Qrcode(qrRegionId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          async (decodedText) => {
            if (!isMounted || isProcessing) return;
            handleScannedToken(decodedText);
          },
          () => {
            // Ignore frame-by-frame read errors
          }
        );
      } catch (err: any) {
        console.warn("Camera start failed, showing fallback input:", err);
        setError("Camera could not be accessed. You can also paste the QR token below.");
        setShowManualInput(true);
      }
    };

    // Small delay to allow DOM element to render
    const timer = setTimeout(() => {
      startScanner();
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => {}).finally(() => {
          scannerRef.current?.clear();
        });
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/40 backdrop-blur-sm animate-fadeIn">
      <GlassCard className="w-full max-w-sm relative !p-6 border-white/80 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-white/60 hover:bg-white text-brand-dark transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-4">
          <div className="w-12 h-12 rounded-xl bg-brand-primary/20 text-brand-primary flex items-center justify-center mx-auto mb-2">
            <QrCode className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-brand-dark">{t.scannerTitle}</h3>
          <p className="text-xs text-brand-muted mt-1">{t.scannerHint}</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 text-xs font-medium flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Video scanning area */}
        <div className="relative rounded-2xl overflow-hidden border-2 border-brand-primary/40 bg-black/5 aspect-square flex items-center justify-center mb-4">
          <div id={qrRegionId} className="w-full h-full" />
          {isProcessing && (
            <div className="absolute inset-0 bg-brand-dark/75 backdrop-blur-md flex flex-col items-center justify-center text-white gap-3 p-4 text-center">
              <div className="relative">
                <div className="w-14 h-14 rounded-full bg-brand-primary/20 flex items-center justify-center animate-pulse">
                  <MapPin className="w-7 h-7 text-brand-primary" />
                </div>
                <div className="absolute -top-1 -right-1">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-brand-primary" />
                <span className="text-xs font-semibold">{stepMessage || t.locationVerifying}</span>
              </div>
              <p className="text-[10px] text-white/70 max-w-[220px]">
                Validating physical presence within 100m geofence
              </p>
            </div>
          )}
        </div>

        {/* Fallback Manual Token input */}
        <div className="space-y-2">
          {!showManualInput ? (
            <button
              onClick={() => setShowManualInput(true)}
              className="text-xs text-brand-muted hover:text-brand-dark text-center w-full font-medium"
            >
              Camera not working? Enter token manually
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (manualToken) handleScannedToken(manualToken);
              }}
              className="space-y-2"
            >
              <input
                type="text"
                placeholder="Paste signed QR token string"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                className="glass-input text-xs"
              />
              <Button
                type="submit"
                variant="primary"
                className="w-full text-xs !py-2"
                isLoading={isProcessing}
              >
                Submit Token
              </Button>
            </form>
          )}

          <Button
            variant="secondary"
            onClick={onClose}
            className="w-full text-xs !py-2"
          >
            {t.close}
          </Button>
        </div>
      </GlassCard>
    </div>
  );
};
