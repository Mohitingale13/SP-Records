/**
 * locationService.ts
 * Enterprise-grade resilient location provider for mobile PWAs.
 * Specifically optimized for older Android and low-spec GPS chipsets indoors:
 * - Background pre-warming while browsing the dashboard
 * - Dual-mode acquisition (High-Accuracy GNSS + Network/Wi-Fi positioning fallback)
 * - Safe short-term position cache (up to 35 seconds, within server freshness window)
 * - 100m accuracy gate strictly preserving the 50m physical office geofence
 */

export interface CachedLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

class LocationService {
  private activeWatchId: number | null = null;
  private lastPosition: CachedLocation | null = null;
  private isWarming: boolean = false;

  /**
   * Starts gentle background GPS pre-warming.
   * Call when StaffDashboard mounts so the hardware is already warm when the user scans.
   */
  public startWarmup(): void {
    if (this.isWarming || typeof window === "undefined" || !navigator.geolocation) {
      return;
    }
    this.isWarming = true;

    try {
      this.activeWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          this.recordCandidate(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.timestamp);
        },
        (err) => {
          // If high accuracy fails on older hardware, retry with network location
          if (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                this.recordCandidate(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.timestamp);
              },
              () => {},
              { enableHighAccuracy: false, timeout: 8000, maximumAge: 30000 }
            );
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 15000,
        }
      );
    } catch (e) {
      console.warn("Background location warmup failed to start:", e);
    }
  }

  /**
   * Stops background location pre-warming.
   */
  public stopWarmup(): void {
    if (this.activeWatchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.activeWatchId);
      this.activeWatchId = null;
    }
    this.isWarming = false;
  }

  /**
   * Returns a valid cached position if fresh (< 35s) and within acceptable accuracy (<= 100m).
   */
  public getFreshCachedLocation(maxAgeMs = 35000, maxAccuracy = 100): CachedLocation | null {
    if (!this.lastPosition) return null;
    const age = Date.now() - this.lastPosition.timestamp;
    if (age <= maxAgeMs && this.lastPosition.accuracy <= maxAccuracy) {
      return this.lastPosition;
    }
    return null;
  }

  private recordCandidate(lat: number, lon: number, accuracy: number, timestamp: number) {
    if (!this.lastPosition || accuracy <= this.lastPosition.accuracy || Date.now() - this.lastPosition.timestamp > 30000) {
      this.lastPosition = {
        latitude: lat,
        longitude: lon,
        accuracy,
        timestamp: timestamp || Date.now(),
      };
    }
  }

  /**
   * Multi-stage progressive location acquisition.
   * Tolerates slower GPS chips on older Androids (up to 20s) and runs high-accuracy + network fallback.
   */
  public acquireLocation(options?: {
    onStepMessage?: (msg: string) => void;
    isMarathi?: boolean;
    maxAccuracy?: number;
  }): Promise<{ latitude: number; longitude: number; accuracy: number; timestamp: string }> {
    const isMr = options?.isMarathi ?? false;
    const maxAcc = options?.maxAccuracy ?? 100.0;
    const onStep = options?.onStepMessage;

    return new Promise((resolve, reject) => {
      // 1. Check instant fresh cache first: if high accuracy (< 55m) is already warm, use it immediately
      const cached = this.getFreshCachedLocation(30000, maxAcc);
      if (cached && cached.accuracy <= 55) {
        resolve({
          latitude: cached.latitude,
          longitude: cached.longitude,
          accuracy: cached.accuracy,
          timestamp: new Date(cached.timestamp).toISOString(),
        });
        return;
      }

      if (!navigator.geolocation) {
        const err: any = new Error("GEOLOCATION_NOT_SUPPORTED");
        reject(err);
        return;
      }

      // Temporarily stop background warmup to prevent dual watchPosition collision on older Android hardware
      this.stopWarmup();

      let resolved = false;
      let localWatchId: number | null = null;
      let timer: NodeJS.Timeout | null = null;
      let networkFallbackTimer: NodeJS.Timeout | null = null;
      let progressTimer1: NodeJS.Timeout | null = null;
      let progressTimer2: NodeJS.Timeout | null = null;
      let bestSeen: CachedLocation | null = cached;

      const cleanup = () => {
        if (localWatchId !== null) {
          navigator.geolocation.clearWatch(localWatchId);
          localWatchId = null;
        }
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        if (networkFallbackTimer !== null) {
          clearTimeout(networkFallbackTimer);
          networkFallbackTimer = null;
        }
        if (progressTimer1 !== null) {
          clearTimeout(progressTimer1);
          progressTimer1 = null;
        }
        if (progressTimer2 !== null) {
          clearTimeout(progressTimer2);
          progressTimer2 = null;
        }
      };

      const finishSuccess = (loc: CachedLocation) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        this.recordCandidate(loc.latitude, loc.longitude, loc.accuracy, loc.timestamp);
        resolve({
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracy: loc.accuracy,
          timestamp: new Date(loc.timestamp).toISOString(),
        });
      };

      const finishError = (reason: string) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        const err: any = new Error(reason);
        reject(err);
      };

      // Progress message 1: initial lock
      onStep?.(isMr ? "जीपीएस सिग्नल शोधत आहे..." : "Acquiring GPS fix...");

      // Extended timeout to 20 seconds for older hardware GPS cold starts
      timer = setTimeout(() => {
        if (resolved) return;
        if (bestSeen && bestSeen.accuracy <= maxAcc) {
          finishSuccess(bestSeen);
        } else {
          finishError("ACCURACY_TOO_LOW");
        }
      }, 20000);

      // Helpful progress cues as time elapses
      progressTimer1 = setTimeout(() => {
        if (!resolved) {
          onStep?.(isMr ? "स्थान अचूकता ऑप्टिमाइझ करत आहे..." : "Calibrating satellite signal...");
        }
      }, 5000);

      progressTimer2 = setTimeout(() => {
        if (!resolved) {
          // If we already have an acceptable fix (e.g. 70m), accept it rather than timing out
          if (bestSeen && bestSeen.accuracy <= maxAcc) {
            finishSuccess(bestSeen);
            return;
          }
          onStep?.(isMr ? "सिग्नल सुधारत आहे..." : "Refining location signal...");
        }
      }, 11000);

      // Start primary High-Accuracy watch
      try {
        localWatchId = navigator.geolocation.watchPosition(
          (pos) => {
            if (resolved) return;
            const acc = pos.coords.accuracy;
            const candidate: CachedLocation = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: acc,
              timestamp: pos.timestamp || Date.now(),
            };

            if (!bestSeen || acc < bestSeen.accuracy) {
              bestSeen = candidate;
            }

            // High precision fix achieved: resolve immediately!
            if (acc <= 45) {
              finishSuccess(candidate);
            } else if (acc <= maxAcc) {
              onStep?.(isMr ? "स्थान अचूकता ऑप्टिमाइझ करत आहे..." : "Optimizing location precision...");
            }
          },
          (err) => {
            if (err.code === err.PERMISSION_DENIED) {
              finishError("PERMISSION_DENIED");
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 18000,
            maximumAge: 15000,
          }
        );
      } catch (e) {
        console.warn("watchPosition failed, falling back to getCurrentPosition:", e);
      }

      // Parallel Network/Fused Location Fallback after 3.2s
      // On older Androids indoors, hardware GPS often stalls, but network/Wi-Fi positioning succeeds quickly
      networkFallbackTimer = setTimeout(() => {
        if (resolved) return;
        onStep?.(isMr ? "इनडोअर स्थान सिग्नल जोडत आहे..." : "Connecting to indoor network location...");

        try {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (resolved) return;
              const acc = pos.coords.accuracy;
              const candidate: CachedLocation = {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: acc,
                timestamp: pos.timestamp || Date.now(),
              };

              if (!bestSeen || acc < bestSeen.accuracy) {
                bestSeen = candidate;
              }

              if (acc <= maxAcc) {
                // If reasonably accurate network fix obtained, finish if high-accuracy hasn't answered
                finishSuccess(candidate);
              }
            },
            () => {},
            {
              enableHighAccuracy: false,
              timeout: 8000,
              maximumAge: 25000,
            }
          );
        } catch {}
      }, 3200);
    });
  }
}

export const locationService = new LocationService();

