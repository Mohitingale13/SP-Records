from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.timezone import utc_now, KOLKATA_TZ
from tests.test_attendance_state_machine import get_authenticated_staff


def test_offline_sync_single_event_success(client: TestClient):
    """Validates that a queued offline event within the office geofence is committed successfully."""
    staff_token, _ = get_authenticated_staff(client, phone="+919811100001", name="Offline Staff 1")
    headers = {"Authorization": f"Bearer {staff_token}"}

    # Simulate offline scan taken at 09:30 AM IST today
    now = utc_now()
    scan_time = now.astimezone(KOLKATA_TZ).replace(hour=9, minute=30, second=0, microsecond=0)

    payload = {
        "events": [
            {
                "offline_id": "offline_evt_101",
                "event_type": "OFFICE_IN",
                "latitude": settings.OFFICE_LATITUDE,
                "longitude": settings.OFFICE_LONGITUDE,
                "accuracy": 15.0,
                "scanned_at": scan_time.isoformat(),
                "location_timestamp": scan_time.isoformat(),
            }
        ]
    }

    response = client.post("/api/v1/attendance/sync-offline", headers=headers, json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["synced_count"] == 1
    assert data["already_exists_count"] == 0
    assert data["failed_count"] == 0
    assert len(data["results"]) == 1

    res_item = data["results"][0]
    assert res_item["offline_id"] == "offline_evt_101"
    assert res_item["status"] == "SYNCED"
    assert res_item["event"]["event_type"] == "OFFICE_IN"
    assert res_item["event"]["verification_method"] == "OFFLINE_GPS"
    assert res_item["event"]["verified_distance_meters"] == 0.0


def test_offline_sync_duplicate_is_idempotent(client: TestClient):
    """Syncing an already recorded offline event returns ALREADY_EXISTS gracefully without error."""
    staff_token, _ = get_authenticated_staff(client, phone="+919811100002", name="Offline Staff 2")
    headers = {"Authorization": f"Bearer {staff_token}"}

    now = utc_now()
    scan_time = now.astimezone(KOLKATA_TZ).replace(hour=9, minute=30, second=0, microsecond=0)

    payload = {
        "events": [
            {
                "offline_id": "offline_evt_201",
                "event_type": "OFFICE_IN",
                "latitude": settings.OFFICE_LATITUDE,
                "longitude": settings.OFFICE_LONGITUDE,
                "accuracy": 12.0,
                "scanned_at": scan_time.isoformat(),
                "location_timestamp": scan_time.isoformat(),
            }
        ]
    }

    # First sync
    res1 = client.post("/api/v1/attendance/sync-offline", headers=headers, json=payload)
    assert res1.status_code == 200
    assert res1.json()["synced_count"] == 1

    # Second sync of the exact same event
    res2 = client.post("/api/v1/attendance/sync-offline", headers=headers, json=payload)
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["synced_count"] == 0
    assert data2["already_exists_count"] == 1
    assert data2["results"][0]["status"] == "ALREADY_EXISTS"


def test_offline_sync_outside_geofence_rejected(client: TestClient):
    """Offline events captured outside the permitted office geofence must be rejected."""
    staff_token, _ = get_authenticated_staff(client, phone="+919811100003", name="Offline Staff 3")
    headers = {"Authorization": f"Bearer {staff_token}"}

    now = utc_now()
    scan_time = now.astimezone(KOLKATA_TZ).replace(hour=9, minute=30, second=0, microsecond=0)

    # Coordinates ~500m away from office
    payload = {
        "events": [
            {
                "offline_id": "offline_evt_remote",
                "event_type": "OFFICE_IN",
                "latitude": 18.140000,
                "longitude": 74.515000,
                "accuracy": 20.0,
                "scanned_at": scan_time.isoformat(),
                "location_timestamp": scan_time.isoformat(),
            }
        ]
    }

    response = client.post("/api/v1/attendance/sync-offline", headers=headers, json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["synced_count"] == 0
    assert data["failed_count"] == 1
    res_item = data["results"][0]
    assert res_item["status"] == "REJECTED"
    assert "Outside office geofence" in res_item["message"]


def test_offline_sync_poor_accuracy_rejected(client: TestClient):
    """Offline events with poor GPS accuracy (>100m) must be rejected."""
    staff_token, _ = get_authenticated_staff(client, phone="+919811100004", name="Offline Staff 4")
    headers = {"Authorization": f"Bearer {staff_token}"}

    now = utc_now()
    scan_time = now.astimezone(KOLKATA_TZ).replace(hour=9, minute=30, second=0, microsecond=0)

    payload = {
        "events": [
            {
                "offline_id": "offline_evt_poor_acc",
                "event_type": "OFFICE_IN",
                "latitude": settings.OFFICE_LATITUDE,
                "longitude": settings.OFFICE_LONGITUDE,
                "accuracy": 185.0,  # Exceeds max 100m
                "scanned_at": scan_time.isoformat(),
                "location_timestamp": scan_time.isoformat(),
            }
        ]
    }

    response = client.post("/api/v1/attendance/sync-offline", headers=headers, json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["synced_count"] == 0
    assert data["failed_count"] == 1
    assert data["results"][0]["status"] == "REJECTED"
    assert "GPS accuracy too low" in data["results"][0]["message"]


def test_offline_sync_sequential_multi_events(client: TestClient):
    """Batch-syncing multi-step offline attendance cycle (Office In then Lunch Out)."""
    staff_token, _ = get_authenticated_staff(client, phone="+919811100005", name="Offline Staff 5")
    headers = {"Authorization": f"Bearer {staff_token}"}

    now = utc_now()
    time_in = now.astimezone(KOLKATA_TZ).replace(hour=9, minute=30, second=0, microsecond=0)
    time_lunch = now.astimezone(KOLKATA_TZ).replace(hour=13, minute=15, second=0, microsecond=0)

    payload = {
        "events": [
            {
                "offline_id": "batch_evt_1",
                "event_type": "OFFICE_IN",
                "latitude": settings.OFFICE_LATITUDE,
                "longitude": settings.OFFICE_LONGITUDE,
                "accuracy": 15.0,
                "scanned_at": time_in.isoformat(),
                "location_timestamp": time_in.isoformat(),
            },
            {
                "offline_id": "batch_evt_2",
                "event_type": "LUNCH_BREAK_OUT",
                "latitude": settings.OFFICE_LATITUDE,
                "longitude": settings.OFFICE_LONGITUDE,
                "accuracy": 18.0,
                "scanned_at": time_lunch.isoformat(),
                "location_timestamp": time_lunch.isoformat(),
            },
        ]
    }

    response = client.post("/api/v1/attendance/sync-offline", headers=headers, json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["synced_count"] == 2
    assert data["failed_count"] == 0

    # Verify status endpoint reflects updated state
    status_res = client.get("/api/v1/attendance/today-status", headers=headers)
    assert status_res.status_code == 200
    status_data = status_res.json()
    assert status_data["status"] == "ON_LUNCH_BREAK"
    assert status_data["next_expected_event"] == "LUNCH_BREAK_IN"

