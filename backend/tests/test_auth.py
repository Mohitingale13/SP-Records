from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.user import User
from app.models.role import RoleName
from app.core.security import verify_pin


def test_health_check(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
    assert response.json()["organization"] == "Shivam Patsanstha"


def test_register_and_login_new_staff(client: TestClient, db_session: Session):
    phone = "+919876543210"
    name = "Ramesh Patil"
    pin = "654321"

    # Step 1: Register staff with 6-digit PIN
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": name,
            "phone_number": phone,
            "pin": pin,
            "confirm_pin": pin,
        },
    )
    assert reg_res.status_code == 200
    data = reg_res.json()
    assert "access_token" in data
    assert data["user"]["full_name"] == name
    assert data["user"]["role"] == RoleName.STAFF.value

    # Verify user exists in database and PIN is hashed with bcrypt
    user = db_session.query(User).filter(User.phone_number == phone).first()
    assert user is not None
    assert user.full_name == name
    assert user.pin_hash is not None
    assert verify_pin(pin, user.pin_hash) is True
    assert user.pin_hash != pin  # Never plain text

    # Step 2: Login with correct PIN
    login_res = client.post(
        "/api/v1/auth/login",
        json={"phone_number": phone, "pin": pin},
    )
    assert login_res.status_code == 200
    assert "access_token" in login_res.json()


def test_duplicate_phone_number_rejection(client: TestClient, db_session: Session):
    phone = "+919876543211"
    name = "Sunita Jadhav"
    pin = "112233"

    # Register first time
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": name,
            "phone_number": phone,
            "pin": pin,
            "confirm_pin": pin,
        },
    )

    # Attempt to register again with same phone
    dup_res = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Another Person",
            "phone_number": phone,
            "pin": "999999",
            "confirm_pin": "999999",
        },
    )
    assert dup_res.status_code == 400
    assert "already registered" in dup_res.json()["detail"].lower()


def test_invalid_pin_and_rate_limiting(client: TestClient, db_session: Session):
    phone = "+919876543212"
    name = "Amit Shinde"
    pin = "123456"

    # Register
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": name,
            "phone_number": phone,
            "pin": pin,
            "confirm_pin": pin,
        },
    )

    # Failed login attempts with incorrect PIN
    for attempt in range(1, settings.MAX_FAILED_LOGIN_ATTEMPTS):
        bad_res = client.post(
            "/api/v1/auth/login",
            json={"phone_number": phone, "pin": "000000"},
        )
        assert bad_res.status_code == 400
        assert "invalid" in bad_res.json()["detail"].lower()

    # The 5th failed attempt triggers temporary lockout
    lock_res = client.post(
        "/api/v1/auth/login",
        json={"phone_number": phone, "pin": "000000"},
    )
    assert lock_res.status_code == 400

    # Next attempt reports account temporarily locked
    attempt_after_lock = client.post(
        "/api/v1/auth/login",
        json={"phone_number": phone, "pin": pin},  # even with correct PIN
    )
    assert attempt_after_lock.status_code == 400
    assert "locked" in attempt_after_lock.json()["detail"].lower()


def test_admin_pin_reset(client: TestClient, db_session: Session):
    # Setup staff
    phone = "+919876543213"
    name = "Kavita Gaikwad"
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": name,
            "phone_number": phone,
            "pin": "111111",
            "confirm_pin": "111111",
        },
    )
    user_id = reg_res.json()["user"]["id"]

    # Setup admin
    super_res = client.post(
        "/api/v1/auth/bootstrap-super-admin",
        json={
            "bootstrap_token": settings.SUPER_ADMIN_BOOTSTRAP_TOKEN,
            "phone_number": "+919999900003",
            "full_name": "Super Admin 3",
            "pin": "123456",
        },
    )
    super_token = super_res.json()["access_token"]

    # Admin resets staff PIN
    reset_res = client.post(
        f"/api/v1/admin/users/{user_id}/reset-pin",
        json={
            "user_id": user_id,
            "new_pin": "998877",
            "confirm_pin": "998877",
            "reason": "Staff forgot previous PIN, verified in person at counter",
        },
        headers={"Authorization": f"Bearer {super_token}"},
    )
    assert reset_res.status_code == 200

    # Staff can now log in with the new PIN
    new_login = client.post(
        "/api/v1/auth/login",
        json={"phone_number": phone, "pin": "998877"},
    )
    assert new_login.status_code == 200
    assert "access_token" in new_login.json()


def test_super_admin_bootstrap(client: TestClient, db_session: Session):
    super_phone = "+919999900001"

    # Invalid token fails
    bad_res = client.post(
        "/api/v1/auth/bootstrap-super-admin",
        json={
            "bootstrap_token": "wrong-token",
            "phone_number": super_phone,
            "full_name": "Chief Trustee",
            "pin": "123456",
        },
    )
    assert bad_res.status_code == 403

    # Valid token succeeds
    good_res = client.post(
        "/api/v1/auth/bootstrap-super-admin",
        json={
            "bootstrap_token": settings.SUPER_ADMIN_BOOTSTRAP_TOKEN,
            "phone_number": super_phone,
            "full_name": "Chief Trustee",
            "pin": "123456",
        },
    )
    assert good_res.status_code == 200
    data = good_res.json()
    assert data["user"]["role"] == RoleName.SUPER_ADMIN.value


def test_get_me_endpoint(client: TestClient):
    phone = "+919876543214"
    auth_res = client.post(
        "/api/v1/auth/register",
        json={
            "phone_number": phone,
            "pin": "123456",
            "confirm_pin": "123456",
            "full_name": "Nilesh Chavan",
        },
    )
    token = auth_res.json()["access_token"]

    # Authenticated request
    me_res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["full_name"] == "Nilesh Chavan"
