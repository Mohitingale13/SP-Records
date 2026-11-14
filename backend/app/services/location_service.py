import math
import uuid
from datetime import datetime
from typing import Optional, Tuple, Union
from sqlalchemy.orm import Session
from fastapi import Request

from app.core.config import settings
from app.core.timezone import utc_now
from app.models.organization import Organization


class LocationService:
    @staticmethod
    def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """
        Calculates the great-circle distance between two points on the Earth's surface
        using the Haversine formula.
        Returns distance strictly in meters.
        """
        # Earth mean radius in meters (WGS84 spherical approximation)
        R = 6371000.0

        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)

        a = (
            math.sin(delta_phi / 2.0) ** 2
            + math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2)
        )
        # Numerical clamp to prevent potential floating point domain errors in asin/atan2
        a = min(1.0, max(0.0, a))
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

        return R * c

    @staticmethod
    def get_office_geofence(
        db: Session, organization_id: Optional[Union[uuid.UUID, str]] = None
    ) -> Tuple[float, float, float]:
        """
        Retrieves the registered office coordinates and permitted geofence radius.
        Checks database Organization first for dynamic overrides; falls back to official configured settings.
        Default: 18.1361880, 74.5104810, radius 100m.
        """
        office_lat = settings.OFFICE_LATITUDE
        office_lon = settings.OFFICE_LONGITUDE
        radius = settings.ATTENDANCE_GEOFENCE_RADIUS_METERS

        if organization_id and db:
            org_uuid = None
            if isinstance(organization_id, uuid.UUID):
                org_uuid = organization_id
            elif isinstance(organization_id, str):
                try:
                    org_uuid = uuid.UUID(organization_id)
                except Exception:
                    org_uuid = None

            if org_uuid:
                org = db.query(Organization).filter(Organization.id == org_uuid).first()
                if org:
                    if org.office_latitude is not None:
                        office_lat = org.office_latitude
                    if org.office_longitude is not None:
                        office_lon = org.office_longitude
                    if org.geofence_radius_meters is not None:
                        radius = org.geofence_radius_meters

        return office_lat, office_lon, radius

    @staticmethod
    def validate_location(
        latitude: float,
        longitude: float,
        accuracy: float,
        location_timestamp: Optional[datetime],
        office_lat: float,
        office_lon: float,
        geofence_radius: float,
        reference_time: Optional[datetime] = None,
    ) -> Tuple[bool, Optional[float], Optional[str]]:
        """
        Comprehensive Server-Side Location Verification:
        1. Coordinate range validation.
        2. Accuracy threshold validation.
        3. Freshness validation (against reference_time or current server time).
        4. Haversine distance geofence validation.

        Returns: (is_valid, distance_in_meters, error_message_if_any)
        """
        # 1. Validate coordinate ranges
        if not (-90.0 <= latitude <= 90.0) or not (-180.0 <= longitude <= 180.0):
            return False, None, "Invalid geographic coordinates provided."

        # 2. Validate location accuracy
        if accuracy is None or accuracy <= 0:
            return False, None, "Invalid GPS accuracy reported by device."

        if accuracy > settings.MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS:
            return (
                False,
                None,
                f"GPS accuracy too low (±{round(accuracy)}m). Maximum acceptable accuracy is "
                f"{int(settings.MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS)}m. "
                "Please enable high-accuracy location or step near an open area and retry.",
            )

        # 3. Validate location timestamp freshness (prevent coordinate replay)
        if location_timestamp:
            baseline_time = reference_time if reference_time is not None else utc_now()
            if baseline_time.tzinfo is None:
                baseline_time = baseline_time.replace(tzinfo=utc_now().tzinfo)

            loc_time = location_timestamp
            if loc_time.tzinfo is None:
                loc_time = loc_time.replace(tzinfo=baseline_time.tzinfo)

            elapsed_seconds = abs((baseline_time - loc_time).total_seconds())
            if elapsed_seconds > settings.LOCATION_TIMESTAMP_MAX_AGE_SECONDS:
                return (
                    False,
                    None,
                    f"Location timestamp is stale ({int(elapsed_seconds)}s old). "
                    f"A fresh GPS fix (under {settings.LOCATION_TIMESTAMP_MAX_AGE_SECONDS}s) is required.",
                )

        # 4. Calculate geodesic distance from official office coordinates
        distance = LocationService.calculate_haversine_distance(
            office_lat, office_lon, latitude, longitude
        )

        if distance > geofence_radius:
            return (
                False,
                distance,
                f"Outside office geofence (~{int(distance)}m away). "
                f"Attendance can only be recorded within {int(geofence_radius)}m of Shivam Patsanstha office.",
            )

        return True, distance, None

    @staticmethod
    def extract_client_ip(request: Request) -> str:
        """
        Safely identifies the client IP behind reverse proxies.
        Only trusts X-Forwarded-For if request.client.host is a configured trusted proxy.
        """
        if not request.client:
            return "127.0.0.1"

        client_host = request.client.host

        if client_host in settings.TRUSTED_PROXIES:
            forwarded = request.headers.get("X-Forwarded-For")
            if forwarded:
                parts = [p.strip() for p in forwarded.split(",")]
                if parts:
                    return parts[0]

        return client_host

    @staticmethod
    def validate_client_ip(client_ip: str) -> Tuple[bool, Optional[str]]:
        """
        Validates client IP if optional office Wi-Fi restriction is enabled.
        """
        if not settings.OFFICE_WIFI_RESTRICTION_ENABLED:
            return True, None

        allowed = [ip.strip() for ip in settings.OFFICE_ALLOWED_IPS if ip.strip()]
        if not allowed:
            return True, None

        if client_ip not in allowed:
            return (
                False,
                f"Request originates outside the authorized Shivam Patsanstha office network (IP: {client_ip}). "
                "Please connect to the official office Wi-Fi network.",
            )

        return True, None
