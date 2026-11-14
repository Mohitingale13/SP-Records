from datetime import datetime, timezone, timedelta, date
from app.core.config import settings

try:
    from zoneinfo import ZoneInfo
    KOLKATA_TZ = ZoneInfo(settings.TIMEZONE)
except Exception:
    # Resilient fallback to fixed offset UTC+05:30 (Indian Standard Time)
    KOLKATA_TZ = timezone(timedelta(hours=5, minutes=30), name="IST")


def utc_now() -> datetime:
    """Returns the current server timestamp in UTC."""
    return datetime.now(timezone.utc)


def kolkata_now() -> datetime:
    """Returns the current timestamp in Asia/Kolkata timezone."""
    return utc_now().astimezone(KOLKATA_TZ)


def get_current_kolkata_date() -> date:
    """Returns the current calendar date in Asia/Kolkata timezone."""
    return kolkata_now().date()


def format_kolkata_time(dt: datetime) -> str:
    """Formats a UTC or offset-aware datetime into HH:MM:SS in Asia/Kolkata."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    kolkata_dt = dt.astimezone(KOLKATA_TZ)
    return kolkata_dt.strftime("%I:%M %p")


def format_kolkata_datetime(dt: datetime) -> str:
    """Formats a UTC or offset-aware datetime into YYYY-MM-DD HH:MM:SS in Asia/Kolkata."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    kolkata_dt = dt.astimezone(KOLKATA_TZ)
    return kolkata_dt.strftime("%Y-%m-%d %I:%M:%S %p")
