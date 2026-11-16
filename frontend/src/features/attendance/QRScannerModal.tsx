import React, { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { GlassCard } from "../../components/common/GlassCard";
import { Button } from "../../components/common/Button";
import { useLanguage } from "../../contexts/LanguageContext";
import { useOffline } from "../../contexts/OfflineContext";
import { attendanceAPI } from "../../services/api";
import { locationService } from "../../services/locationService";
import {
  X,
  QrCode,
  MapPin,
  ShieldCheck,
  Loader2,
  WifiOff,
  Navigation,
  RotateCcw,
  CheckCircle2,
  Zap,
  ZapOff,
} from "lucide-react";
import type { AttendanceEvent, ScanLocationPayload, AttendanceEventType } from "../../types";

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (event: AttendanceEvent, isOffline?: boolean) => void;
  expectedEventType?: AttendanceEventType | null;
}

type ScanState = "SCANNING" | "PROCESSING" | "SUCCESS" | "ERROR";

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  expectedEventType,
}) => {
  const { t, language } = useLanguage();
  const { isOnline, saveOfflineAttendance } = useOffline();

  const [scanState, setScanState] = useState<ScanState>("SCANNING");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [stepMessage, setStepMessage] = useState<string>("");
  const [recordedEvent, setRecordedEvent] = useState<AttendanceEvent | null>(null);
  const [isOfflineSaved, setIsOfflineSaved] = useState<boolean>(false);
  const [manualToken, setManualToken] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const autoCloseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const bestPositionRef = useRef<GeolocationPosition | null>(null);
  const geoWatchIdRef = useRef<number | null>(null);
  const qrRegionId = "sp-qr-reader";

  // Friendly error message formatter - eliminates all technical/developer terms
  const formatFriendlyError = useCallback(
    (rawError: string): string => {
      const isMr = language === "mr";
      const str = String(rawError || "");

      // 1. Outside Geofence
      if (/geofence|outside office/i.test(str)) {
        const match = str.match(/~?\s*(\d+)\s*m/);
        const dist = match ? match[1] : null;
        if (isMr) {
          return dist
            ? `तुम्ही कार्यालयापासून अंदाजे ${dist} मीटर अंतरावर आहात. उपस्थिती फक्त शिवम पतसंस्था कार्यालयाच्या ५० मीटर आवारातच नोंदवता येईल.`
            : t.outsideGeofenceMessage;
        }
        return dist
          ? `You are approximately ${dist} meters away from the office. Attendance can only be recorded within 50m of Shivam Patsanstha office.`
          : t.outsideGeofenceMessage;
      }

      // 2. Rapid Scan Protection
      if (/rapid scan|wait/i.test(str)) {
        return t.rapidScanWarning;
      }

      // 3. Daily Cycle Completed
      if (/already completed|cycle for today|completed/i.test(str)) {
        return isMr
          ? "आजच्या दिवसाची संपूर्ण उपस्थिती नोंदवून पूर्ण झाली आहे."
          : "You have already completed your daily attendance for today.";
      }

      // 4. GPS Accuracy Too Low
      if (/accuracy/i.test(str)) {
        return isMr
          ? "GPS सिग्नल कमकुवत आहे. कृपया खिडकीजवळ किंवा मोकळ्या जागेत जा आणि पुन्हा प्रयत्न करा."
          : "GPS signal is weak. Please move near a window or open area and retry.";
      }

      // 5. Stale GPS Timestamp
      if (/stale/i.test(str)) {
        return isMr
          ? "लोकेशन माहिती जुनी झाली होती. कृपया ताज्या GPS सिग्नलसाठी पुन्हा प्रयत्न करा."
          : "Location signal was stale. Please retry to capture a fresh GPS fix.";
      }

      // 6. Invalid QR Token
      if (/token|qr/i.test(str)) {
        return isMr
          ? "अवैध QR कोड. कृपया कार्यालयातील अधिकृत शिवम पतसंस्था QR पोस्टर स्कॅन करा."
          : "Invalid QR code. Please scan the official Shivam Patsanstha office QR poster.";
      }

      // 7. Camera Permission / Blocked
      if (/NotAllowedError|Permission denied|camera/i.test(str)) {
        return t.cameraErrorPermission;
      }

      // 8. GPS / Location Permission
      if (/geolocation|location permission|denied/i.test(str)) {
        return t.gpsErrorPermission;
      }

      // 9. Position Unavailable
      if (/unavailable/i.test(str)) {
        return t.gpsErrorUnavailable;
      }

      // 10. Generic Polite Fallback
      return isMr
        ? "उपस्थिती नोंदवता आली नाही. कृपया तुम्ही कार्यालयात असल्याची खात्री करा आणि पुन्हा प्रयत्न करा."
        : "Could not record attendance. Please ensure you are at Shivam Patsanstha office and retry.";
    },
    [language, t]
  );

  const getEventName = (eventType: AttendanceEventType): string => {
    switch (eventType) {
      case "OFFICE_IN":
        return t.officeIn;
      case "LUNCH_BREAK_OUT":
        return t.lunchBreakOut;
      case "LUNCH_BREAK_IN":
        return t.lunchBreakIn;
      case "OFFICE_OUT":
        return t.officeOut;
      default:
        return eventType;
    }
  };

  const stopScannerSafely = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
      } catch {}
    }
  };

  const toggleTorch = async () => {
    if (!scannerRef.current) return;
    try {
      const nextTorch = !isTorchOn;
      await (scannerRef.current as any).applyVideoConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setIsTorchOn(nextTorch);
    } catch (e) {
      console.warn("Could not toggle torch:", e);
    }
  };

  const restartScanner = async () => {
    setErrorMessage("");
    setScanState("SCANNING");
    if (scannerRef.current) {
      try {
        await scannerRef.current.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const minDim = Math.min(viewfinderWidth, viewfinderHeight);
              const boxSize = Math.max(220, Math.floor(minDim * 0.85));
              return { width: boxSize, height: boxSize };
            },
            videoConstraints: {
              facingMode: "environment",
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          (text) => handleScannedToken(text),
          () => {}
        );
      } catch (err: any) {
        setErrorMessage(t.cameraErrorPermission);
        setScanState("ERROR");
      }
    }
  };

  // Progressive Enterprise GPS Acquisition:
  // Uses dashboard pre-warm cache, parallel GNSS + Network Wi-Fi positioning, and extended indoor lock window (12s)
  const acquirePosition = async (): Promise<{
    coords: { latitude: number; longitude: number; accuracy: number };
    timestamp: number;
  }> => {
    const loc = await locationService.acquireLocation({
      onStepMessage: (msg) => {
        if (isMountedRef.current) setStepMessage(msg);
      },
      isMarathi: language === "mr",
      maxAccuracy: 110.0,
    });
    return {
      coords: {
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracy: loc.accuracy,
      },
      timestamp: new Date(loc.timestamp).getTime(),
    };
  };

  const handleScannedToken = async (token: string) => {
    if (scanState === "PROCESSING") return;
    setScanState("PROCESSING");
    setErrorMessage("");
    setStepMessage(t.locationAcquiring);

    // Stop camera immediately
    await stopScannerSafely();

    // Step 1: Verify browser geolocation support
    if (!navigator.geolocation) {
      setErrorMessage(t.locationNotSupported);
      setScanState("ERROR");
      return;
    }

    // Step 2: Request Progressive High-Accuracy GPS Position
    try {
      const pos = await acquirePosition();
      if (!isMountedRef.current) return;

      const { latitude, longitude, accuracy } = pos.coords;
      const location_timestamp = new Date(pos.timestamp).toISOString();

      // Check reported accuracy threshold (110m maximum acceptable for indoor reliability on older devices)
      if (accuracy > 110) {
        const friendlyAcc =
          language === "mr"
            ? "GPS सिग्नल कमकुवत आहे. कृपया खिडकीजवळ किंवा मोकळ्या जागेत जा आणि पुन्हा प्रयत्न करा."
            : "GPS signal is weak. Please move near a window or open area and retry.";
        setErrorMessage(friendlyAcc);
        setScanState("ERROR");
        return;
      }

      setStepMessage(t.locationVerifying);

      // ==========================================
      // OFFLINE MODE: Save to Local Queue Directly
      // ==========================================
      if (!navigator.onLine || !isOnline) {
        try {
          const offlineRec = await saveOfflineAttendance({
            eventType: expectedEventType || "OFFICE_IN",
            latitude,
            longitude,
            accuracy,
            qrToken: token.trim(),
            locationTimestamp: location_timestamp,
          });

          const optimisticEvent: AttendanceEvent = {
            id: offlineRec.id,
            event_type: offlineRec.event_type,
            event_date: new Date().toISOString().split("T")[0],
            scanned_at: offlineRec.scanned_at,
            scanned_at_ist: new Date().toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            is_manually_corrected: false,
            reported_accuracy_meters: accuracy,
            verification_method: "OFFLINE_GPS",
          };

          setRecordedEvent(optimisticEvent);
          setIsOfflineSaved(true);
          setScanState("SUCCESS");

          // Auto-dismiss after 3.5 seconds
          autoCloseTimerRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              onSuccess(optimisticEvent, true);
              onClose();
            }
          }, 3500);

          return;
        } catch (offlineErr: any) {
          setErrorMessage(
            language === "mr"
              ? "स्थानिक फोन मेमरीमध्ये उपस्थिती सेव्ह होऊ शकली नाही. कृपया पुन्हा प्रयत्न करा."
              : "Could not save attendance to local storage. Please retry."
          );
          setScanState("ERROR");
          return;
        }
      }

      // ==========================================
      // ONLINE MODE: Submit to Backend
      // ==========================================
      try {
        const payload: ScanLocationPayload = {
          qr_token: token.trim(),
          latitude,
          longitude,
          accuracy,
          location_timestamp,
        };

        const event = await attendanceAPI.scan(payload);

        setRecordedEvent(event);
        setIsOfflineSaved(false);
        setScanState("SUCCESS");

        // Auto-dismiss after 3.5 seconds
        autoCloseTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            onSuccess(event, false);
            onClose();
          }
        }, 3500);
      } catch (err: any) {
        if (!isMountedRef.current) return;

        // If network connection dropped during scan, gracefully buffer offline!
        if (!err.response || err.code === "ERR_NETWORK" || !navigator.onLine) {
          try {
            const offlineRec = await saveOfflineAttendance({
              eventType: expectedEventType || "OFFICE_IN",
              latitude,
              longitude,
              accuracy,
              qrToken: token.trim(),
              locationTimestamp: location_timestamp,
            });

            const optimisticEvent: AttendanceEvent = {
              id: offlineRec.id,
              event_type: offlineRec.event_type,
              event_date: new Date().toISOString().split("T")[0],
              scanned_at: offlineRec.scanned_at,
              scanned_at_ist: new Date().toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              }),
              is_manually_corrected: false,
              reported_accuracy_meters: accuracy,
              verification_method: "OFFLINE_GPS",
            };

            setRecordedEvent(optimisticEvent);
            setIsOfflineSaved(true);
            setScanState("SUCCESS");

            autoCloseTimerRef.current = setTimeout(() => {
              if (isMountedRef.current) {
                onSuccess(optimisticEvent, true);
                onClose();
              }
            }, 3500);
            return;
          } catch {}
        }

        const rawMsg = err.response?.data?.detail || err.message || "";
        setErrorMessage(formatFriendlyError(rawMsg));
        setScanState("ERROR");
      }
    } catch (geoErr: any) {
      if (!isMountedRef.current) return;
      let errMsg = t.locationTimeout;
      if (geoErr.code === geoErr.PERMISSION_DENIED || geoErr.message === "PERMISSION_DENIED") {
        errMsg = t.gpsErrorPermission;
      } else if (geoErr.code === geoErr.POSITION_UNAVAILABLE || geoErr.message === "POSITION_UNAVAILABLE") {
        errMsg = t.gpsErrorUnavailable;
      } else if (
        geoErr.message === "ACCURACY_TOO_LOW" ||
        /accuracy/i.test(geoErr.message || "")
      ) {
        errMsg =
          language === "mr"
            ? "GPS सिग्नल कमकुवत आहे. कृपया खिडकीजवळ किंवा मोकळ्या जागेत जा आणि पुन्हा प्रयत्न करा."
            : "GPS signal is weak. Please move near a window or open area and retry.";
      }
      setErrorMessage(errMsg);
      setScanState("ERROR");
    }
  };

  const handleSuccessDone = () => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
    }
    if (recordedEvent) {
      onSuccess(recordedEvent, isOfflineSaved);
    }
    onClose();
  };

  useEffect(() => {
    isMountedRef.current = true;
    if (!isOpen) {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
      }
      if (geoWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
        geoWatchIdRef.current = null;
      }
      bestPositionRef.current = null;
      setIsTorchOn(false);
      setHasTorch(false);
      return;
    }

    setScanState("SCANNING");
    setErrorMessage("");
    setRecordedEvent(null);
    setIsOfflineSaved(false);
    setStepMessage("");
    setIsTorchOn(false);
    setHasTorch(false);

    // Pre-warm GPS in the background immediately as modal opens
    locationService.startWarmup();

    const startScanner = async () => {
      try {
        const scanner = new Html5Qrcode(qrRegionId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const minDim = Math.min(viewfinderWidth, viewfinderHeight);
              const boxSize = Math.max(220, Math.floor(minDim * 0.85));
              return { width: boxSize, height: boxSize };
            },
            videoConstraints: {
              facingMode: "environment",
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          async (decodedText) => {
            if (!isMountedRef.current || scanState === "PROCESSING") return;
            handleScannedToken(decodedText);
          },
          () => {}
        );

        // Detect torch support
        try {
          const track = (scanner as any).getRunningTrackCapabilities?.();
          if (track && track.torch) {
            setHasTorch(true);
          }
        } catch {}
      } catch (err: any) {
        console.warn("Camera start failed:", err);
        setErrorMessage(t.cameraErrorPermission);
        setShowManualInput(true);
      }
    };

    const timer = setTimeout(() => {
      startScanner();
    }, 200);

    return () => {
      isMountedRef.current = false;
      clearTimeout(timer);
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
      }
      if (geoWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
        geoWatchIdRef.current = null;
      }
      bestPositionRef.current = null;
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current
          .stop()
          .catch(() => {})
          .finally(() => {
            scannerRef.current?.clear();
          });
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/50 backdrop-blur-md animate-fadeIn">
      <GlassCard className="w-full max-w-sm sm:max-w-md relative !p-4 sm:!p-6 border-white/80 shadow-2xl overflow-hidden transition-all duration-300">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-white/60 hover:bg-white text-brand-dark transition-all z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ============================================================== */}
        {/* SUCCESS SCREEN: ANIMATED GREEN SCREEN WITH VECTOR DRAWING CHECK */}
        {/* ============================================================== */}
        {scanState === "SUCCESS" && recordedEvent && (
          <div className="text-center py-2 animate-fadeIn">
            {/* Animated Checkmark Circle with Smooth Pen-Marking Motion */}
            <div className="w-24 h-24 mx-auto mb-4 relative flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-emerald-500/15 checkmark-ripple-ring" />
              <div className="relative w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/40 flex items-center justify-center shadow-lg shadow-emerald-500/15 checkmark-badge-pop">
                <svg className="w-14 h-14" viewBox="0 0 52 52">
                  <circle
                    className="checkmark-circle text-emerald-500 fill-none stroke-current"
                    cx="26"
                    cy="26"
                    r="24"
                    strokeWidth="3.5"
                  />
                  <path
                    className="checkmark-check text-emerald-600 fill-none stroke-current"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14 27l7 7 16-16"
                  />
                </svg>
              </div>
            </div>

            <h3 className="text-xl font-bold text-emerald-950 mb-1">
              {t.scanSuccessTitle}
            </h3>
            <p className="text-xs text-emerald-800/80 mb-5">
              {t.scanSuccessSubtitle}
            </p>

            {/* Attendance Details Card */}
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-left space-y-2 mb-5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-emerald-900 font-medium">
                  {language === "mr" ? "उपस्थिती प्रकार" : "Event"}:
                </span>
                <span className="font-bold text-emerald-950 px-2 py-0.5 rounded-lg bg-emerald-500/20">
                  {getEventName(recordedEvent.event_type)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-emerald-900 font-medium">
                  {language === "mr" ? "नोंद वेळ" : "Recorded Time"}:
                </span>
                <span className="font-bold text-emerald-950">
                  {recordedEvent.scanned_at_ist}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-emerald-500/20">
                <span className="text-emerald-900 font-medium">
                  {language === "mr" ? "स्थान पडताळणी" : "Verification"}:
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {isOfflineSaved ? t.offlinePendingBadge : t.gpsVerifiedBadge}
                </span>
              </div>
            </div>

            <Button
              variant="primary"
              onClick={handleSuccessDone}
              className="w-full !py-2.5 font-bold shadow-lg"
              icon={<CheckCircle2 className="w-4 h-4" />}
            >
              {t.done}
            </Button>
          </div>
        )}

        {/* ========================================================== */}
        {/* ERROR SCREEN: ANIMATED RED SCREEN WITH VECTOR DRAWING CROSS */}
        {/* ========================================================== */}
        {scanState === "ERROR" && (
          <div className="text-center py-2 animate-fadeIn">
            {/* Animated Cross Circle */}
            <div className="w-24 h-24 mx-auto mb-4 relative flex items-center justify-center">
              <div className="relative w-20 h-20 rounded-full bg-rose-500/10 border-2 border-rose-500/40 flex items-center justify-center shadow-lg shadow-rose-500/15 cross-badge-pop">
                <svg className="w-14 h-14" viewBox="0 0 52 52">
                  <circle
                    className="cross-circle text-rose-500 fill-none stroke-current"
                    cx="26"
                    cy="26"
                    r="24"
                    strokeWidth="3.5"
                  />
                  <path
                    className="cross-line text-rose-600 fill-none stroke-current"
                    strokeWidth="4"
                    strokeLinecap="round"
                    d="M17 17l18 18"
                  />
                  <path
                    className="cross-line text-rose-600 fill-none stroke-current"
                    strokeWidth="4"
                    strokeLinecap="round"
                    d="M35 17l-18 18"
                  />
                </svg>
              </div>
            </div>

            <h3 className="text-xl font-bold text-rose-950 mb-1">
              {t.scanFailedTitle}
            </h3>
            <p className="text-xs text-rose-800/80 mb-4">
              {t.scanFailedSubtitle}
            </p>

            {/* Clear, polite error message card */}
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-950 text-xs font-semibold text-center mb-5 leading-relaxed">
              {errorMessage || t.outsideGeofenceMessage}
            </div>

            <div className="space-y-2">
              <Button
                variant="primary"
                onClick={restartScanner}
                className="w-full !py-2.5 font-bold shadow-md"
                icon={<RotateCcw className="w-4 h-4" />}
              >
                {t.tryAgain}
              </Button>

              <Button
                variant="secondary"
                onClick={() => handleScannedToken("OFFLINE_GPS_PRESENCE")}
                className="w-full !py-2.5 text-xs font-bold border-brand-primary/40 hover:bg-brand-primary/10 flex items-center justify-center gap-2"
                icon={<Navigation className="w-4 h-4 text-brand-primary" />}
              >
                {t.directGpsCheckIn}
              </Button>

              <Button
                variant="secondary"
                onClick={onClose}
                className="w-full text-xs !py-2"
              >
                {t.close}
              </Button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* NORMAL SCANNING / PROCESSING VIEW */}
        {/* ============================================================== */}
        {(scanState === "SCANNING" || scanState === "PROCESSING") && (
          <div>
            <div className="text-center mb-3">
              <div className="w-12 h-12 rounded-xl bg-brand-primary/20 text-brand-primary flex items-center justify-center mx-auto mb-2">
                <QrCode className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-brand-dark">{t.scannerTitle}</h3>
              <p className="text-xs text-brand-muted mt-1">{t.scannerHint}</p>
            </div>

            {/* Offline Banner Indicator */}
            {!isOnline && (
              <div className="mb-3 p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-900 text-xs font-semibold flex items-center gap-2">
                <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  {t.offlineGpsReady} - {language === "mr" ? "उपस्थिती फोनमध्ये साठवली जाईल." : "Attendance will be saved locally & synced automatically."}
                </span>
              </div>
            )}

            {/* Video scanning area */}
            <div className="relative rounded-2xl overflow-hidden border-2 border-brand-primary/40 bg-black/10 w-full h-[280px] sm:h-[320px] flex items-center justify-center mb-3">
              <div id={qrRegionId} className="w-full h-full" />

              {/* Torch / Flashlight Button if camera supports it */}
              {hasTorch && scanState === "SCANNING" && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`absolute top-3 right-3 z-10 p-2 rounded-xl backdrop-blur-md transition-all flex items-center gap-1.5 text-xs font-bold ${
                    isTorchOn
                      ? "bg-amber-400 text-amber-950 shadow-lg shadow-amber-400/40"
                      : "bg-black/50 text-white hover:bg-black/70"
                  }`}
                  title={language === "mr" ? "टॉर्च चालू/बंद करा" : "Toggle Flashlight"}
                >
                  {isTorchOn ? <Zap className="w-4 h-4 fill-current" /> : <ZapOff className="w-4 h-4" />}
                  <span>{language === "mr" ? "टॉर्च" : "Flash"}</span>
                </button>
              )}
              {scanState === "PROCESSING" && (
                <div className="absolute inset-0 bg-brand-dark/80 backdrop-blur-md flex flex-col items-center justify-center text-white gap-3 p-4 text-center z-20">
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
                    {language === "mr" ? "कार्यालयीन ५० मीटर जिओफेन्स पडताळणी..." : "Validating physical presence within 50m geofence"}
                  </p>
                </div>
              )}
            </div>

            {/* Direct GPS Check-In Button */}
            <div className="space-y-2">
              <Button
                variant="secondary"
                onClick={() => handleScannedToken("OFFLINE_GPS_PRESENCE")}
                className="w-full text-xs !py-2.5 font-bold border-brand-primary/40 hover:bg-brand-primary/10 flex items-center justify-center gap-2"
                isLoading={scanState === "PROCESSING"}
                icon={<Navigation className="w-4 h-4 text-brand-primary" />}
              >
                {t.directGpsCheckIn}
              </Button>

              {/* Fallback Manual Token input */}
              {!showManualInput ? (
                <button
                  onClick={() => setShowManualInput(true)}
                  className="text-xs text-brand-muted hover:text-brand-dark text-center w-full font-medium py-1"
                >
                  {language === "mr" ? "कॅमेरा अडचण? टोकन मॅन्युअली टाका" : "Camera problem? Enter token manually"}
                </button>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (manualToken) handleScannedToken(manualToken);
                  }}
                  className="space-y-2 pt-1"
                >
                  <input
                    type="text"
                    placeholder={language === "mr" ? "QR टोकन येथे टाका" : "Paste signed QR token string"}
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    className="glass-input text-xs"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full text-xs !py-2"
                    isLoading={scanState === "PROCESSING"}
                  >
                    {t.submit}
                  </Button>
                </form>
              )}

              <Button variant="secondary" onClick={onClose} className="w-full text-xs !py-2">
                {t.close}
              </Button>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
};
