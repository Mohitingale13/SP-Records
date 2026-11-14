# Shivam Patsanstha – Digital Attendance Management System

A production-minded, mobile-first Progressive Web Application (PWA) engineered specifically for **Shivam Patsanstha**. The application automates staff attendance using cryptographically signed, rotating QR codes displayed on an office kiosk, auto-determining the daily four-step attendance lifecycle (`OFFICE_IN` → `LUNCH_BREAK_OUT` → `LUNCH_BREAK_IN` → `OFFICE_OUT`), backed by server-authoritative timestamps in Indian Standard Time (`Asia/Kolkata`).

---

## 1. Project Architecture & Tech Stack

```
SP-Records/
├── backend/                    # Python FastAPI REST API
│   ├── alembic/                # Database migrations
│   ├── app/
│   │   ├── api/v1/             # Endpoints (auth, attendance, qr, admin, reports)
│   │   ├── assets/fonts/       # Bundled Noto Sans Devanagari TrueType fonts
│   │   ├── core/               # Config, JWT, HMAC QR security, Timezone (Asia/Kolkata), Security
│   │   ├── db/                 # Base model, SQLAlchemy engine & SessionLocal
│   │   ├── models/             # SQLAlchemy 2.0 ORM models (PEP 563 future annotations)
│   │   ├── schemas/            # Pydantic v2 schemas
│   │   └── services/           # Business logic: State Machine, QR engine, Auth, PDF Reports
│   ├── tests/                  # Pytest test suite (21 tests passing)
│   ├── requirements.txt        # Python dependencies
│   └── main.py                 # FastAPI application entrypoint
├── frontend/                   # React 19+ TypeScript PWA
│   ├── public/                 # PWA icons & manifest assets
│   ├── src/
│   │   ├── components/         # Glassmorphic UI (GlassCard, Button, Badge, ShivamLogo, SplashScreen)
│   │   ├── contexts/           # AuthContext, LanguageContext (EN / MR)
│   │   ├── features/           # Domain modules (auth, attendance, qr kiosk, admin)
│   │   ├── i18n/               # Bilingual dictionary (English & Marathi)
│   │   ├── services/           # Typed Axios API client with dynamic LAN IP resolution
│   │   ├── styles/             # Tailwind design tokens & custom glassmorphism
│   │   └── types/              # TypeScript interfaces mirroring API
│   ├── package.json
│   ├── tailwind.config.js
│   ├── vercel.json             # Vercel deployment configuration
│   └── vite.config.ts          # Vite configuration with host: 0.0.0.0 and PWA plugin
├── docs/                       # Architecture & technical specifications
│   ├── architecture.md
│   ├── database-schema.md
│   ├── attendance-workflow.md
│   ├── qr-security.md
│   ├── phase-2-completion-audit.md
│   └── implementation-plan.md
├── render.yaml                 # Render backend deployment spec
├── vercel.json                 # Vercel root deployment spec
└── README.md
```

### Technology Highlights:
- **Backend**: Python 3.10+, FastAPI, SQLAlchemy 2.x with `from __future__ import annotations`, Alembic, Pydantic v2, ReportLab with embedded Unicode Devanagari TrueType fonts, `python-jose` (HS256 JWT & HMAC QR), native `bcrypt` PIN hashing, PostgreSQL (Neon compatible) / SQLite for local development.
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS with custom glassmorphism, React Router 7, Lucide React icons, `vite-plugin-pwa` (offline service worker + web app manifest), `html5-qrcode` mobile scanner, `qrcode` kiosk canvas generator.
- **Authentication**: Zero external SMS/OTP dependency. Secure authentication via **Full Name + Phone Number + 6-digit numeric PIN** with bcrypt hashing, progressive lockouts for repeated failed attempts, and administrative PIN reset with mandatory audit reason logging.
- **Design System**: Frosted glass cards, translucent surfaces (`rgba(255, 255, 255, 0.55)`), soft cyan/turquoise accents (`#00C7C7`, `#36BFCB`), watery blue background (`#B8F2EC` to `#D9FAF5`), dark teal typography (`#153B43`), Devanagari typography support (`Mukta` & `Noto Sans Devanagari`).
- **Bilingual**: Seamless English and Marathi (`मराठी`) language toggle with localStorage persistence across all screens.

---

## 2. Core Functional Capabilities

### A. Four-Step Attendance State Machine
The backend autonomously determines and enforces the chronological event sequence for each working day:
1. **Office In (`OFFICE_IN`)**: Arrival at the branch.
2. **Lunch Break Out (`LUNCH_BREAK_OUT`)**: Departure for lunch.
3. **Lunch Break In (`LUNCH_BREAK_IN`)**: Return from lunch.
4. **Office Out (`OFFICE_OUT`)**: Departure at the end of the shift.

- **Idempotency & Debounce**: Rapid repeated scans from camera frames are blocked by a configurable spacing interval.
- **Composite Uniqueness**: Composite DB constraint `(user_id, event_date, event_type)` guarantees no duplicate scans.
- **Server-Authoritative Clock**: All timestamps are computed in UTC and formatted for display in `Asia/Kolkata` (`UTC+05:30`).

### B. Rotating Ephemeral QR Code Security & Kiosk
- Reception kiosk generates an HMAC-SHA256 signed rotating token every 20–25 seconds.
- Tokens include a unique UUID nonce (`jti`), organization identifier, issuance time, and absolute expiration.
- Prevents remote proxy attendance (photographing the QR to send to absent colleagues).
- **Multi-user concurrency**: Multiple employees standing at the counter can scan the same active rotating QR.
- **Single-use per employee**: A staff member cannot redeem the same QR nonce twice.
- **Live IST Clock**: Built-in Indian Standard Time digital clock updating every second on the reception kiosk screen with full-screen capability.

### C. Bilingual PDF Reports (English & Marathi Devanagari)
- **Weekly & Monthly Attendance PDF Reports**: Generated on-demand via ReportLab.
- **Devanagari Font Rendering**: Bundles `NotoSansDevanagari-Regular.ttf` and `NotoSansDevanagari-Bold.ttf` for pristine Marathi script rendering.
- **Role Guard**: Restricted to `ADMIN` and `SUPER_ADMIN`; regular staff accessing the PDF endpoints are rejected with HTTP 403 Forbidden.

### D. Role-Based Access Control (RBAC) & PIN Security
- **Staff Member**: Registers with Name, Phone, and 6-digit PIN; views today's status, scans QR, inspects personal history.
- **Organization Admin**: Live real-time dashboard of all staff (Present, On Break, Completed, Not Started); manual corrections with mandatory audit log justification; employee PIN reset.
- **Super Admin**: Securely bootstrapped via environment token; elevates or revokes Admin roles with confirmation dialog.

---

## 3. Local Development & LAN Mobile Testing Setup

### Step 1: Start Backend on All Network Interfaces
Open a PowerShell terminal:
```powershell
cd "c:\Users\Mohit\Desktop\SP Records\backend"
.\venv\Scripts\Activate.ps1
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
API interactive documentation: `http://localhost:8000/docs`

### Step 2: Start Frontend on All Network Interfaces
Open a second PowerShell terminal:
```powershell
cd "c:\Users\Mohit\Desktop\SP Records\frontend"
npm run dev
```
Local access: `http://localhost:5173`

### Step 3: Access from Actual Mobile Phone on the Same Wi-Fi
Find your computer's LAN IP address:
```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.254*" } | Select-Object IPAddress, InterfaceAlias
```
*(On this machine, the LAN IP is **`10.138.97.213`**)*

1. Ensure your mobile phone is connected to the **same Wi-Fi network**.
2. Open your mobile browser (Chrome/Safari) and navigate to:
   ```
   http://10.138.97.213:5173
   ```
3. The frontend automatically connects to the backend at `http://10.138.97.213:8000/api/v1` via dynamic hostname detection.

### Step 4: Windows Firewall Configuration (If Connection Times Out)
If your phone cannot load the page, run this command in **PowerShell as Administrator**:
```powershell
New-NetFirewallRule -DisplayName "Shivam Attendance Vite (5173)" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Shivam Attendance FastAPI (8000)" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
```

### Step 5: Mobile Camera Access & HTTPS Requirements
Mobile web browsers (iOS Safari and Android Chrome) **restrict camera access (`getUserMedia`) to Secure Contexts (`https://` or `localhost`)**.
- When testing on a physical phone over plain `http://10.138.97.213:5173`, staff registration, PIN login, dashboards, reports, and manual token input work completely.
- To test the **live phone camera** against the office kiosk screen:
  - **Option A (Cloudflare Tunnel - Recommended & Free)**:
    ```bash
    npx cloudflared tunnel --url http://localhost:5173
    ```
    Open the generated `https://xxxx.trycloudflare.com` link on your phone.
  - **Option B (Ngrok)**:
    ```bash
    ngrok http 5173
    ```
  - **Option C (Built-in Manual Token Fallback)**:
    Click "Enter Token Manually" in the scanner modal on your phone to paste any active rotating token generated on the kiosk screen.

---

## 4. Running the Automated Test Suite

All 21 backend tests validate PIN authentication, rate limiting, the attendance state machine, QR cryptographic integrity, admin audit logging, PDF report generation, and role management.

```powershell
cd "c:\Users\Mohit\Desktop\SP Records\backend"
$env:PYTHONPATH="."
.\venv\Scripts\pytest.exe tests -v
```

### Test Coverage Summary (21 Tests Passing):
- `test_health_check`: Root service health check.
- `test_register_and_login_new_staff`: Full Name + Phone + 6-digit PIN onboarding and login.
- `test_duplicate_phone_number_rejection`: Immediate conflict rejection for existing phone.
- `test_invalid_pin_and_rate_limiting`: Failed attempt counting and progressive account lockout.
- `test_admin_pin_reset`: Admin PIN reset with mandatory written justification and audit logging.
- `test_super_admin_bootstrap`: Provisioning Super Admin with PIN and security token.
- `test_get_me_endpoint`: JWT identity resolution.
- `test_full_attendance_state_machine_cycle`: Monotonic progression (`OFFICE_IN` → `LUNCH_BREAK_OUT` → `LUNCH_BREAK_IN` → `OFFICE_OUT` → completion rejection).
- `test_qr_replay_attack_prevention`: Per-user nonce redemption check.
- `test_multi_user_shared_qr_scan`: Multiple colleagues sharing the same active rotating QR.
- `test_tampered_qr_signature_rejection`: HMAC signature validation.
- `test_expired_qr_rejection`: Token expiration check.
- `test_admin_manual_addition_with_audit_log`: Manual injection with mandatory justification.
- `test_admin_daily_monitor`: Real-time presence aggregation.
- `test_admin_correction_and_staff_history`: Admin record correction with immutable audit trail.
- `test_weekly_pdf_report_english`: ReportLab English weekly PDF generation.
- `test_weekly_pdf_report_marathi`: ReportLab Marathi Devanagari Unicode PDF generation.
- `test_monthly_pdf_report`: ReportLab monthly PDF generation.
- `test_staff_cannot_download_reports`: Security verification that staff receives 403 on report endpoints.
- `test_super_admin_role_assignment_and_revocation`: Promotion and revocation of Admin role by Super Admin.
- `test_ordinary_admin_cannot_alter_roles`: Ordinary Admin cannot elevate/revoke roles (403 Forbidden).

Frontend test suite (`vitest`):
```powershell
cd "c:\Users\Mohit\Desktop\SP Records\frontend"
npm test -- --run
```

Frontend production build (`tsc` & `vite`):
```powershell
npm run build
```

---

## 5. Deployment Guide

### Backend: Render
1. Connect repository to [Render](https://render.com).
2. Render detects `render.yaml` automatically.
3. Configure environment variables in the Render dashboard:
   - `DATABASE_URL`: Connection string to PostgreSQL (e.g. Neon).
   - `SUPER_ADMIN_BOOTSTRAP_TOKEN`: Private token for initial Super Admin setup.
   - `CORS_ORIGINS`: Your Vercel frontend URL.

### Frontend: Vercel
1. Connect repository to [Vercel](https://vercel.com).
2. Set Root Directory to `frontend` or use root configuration (configured via `vercel.json`).
3. Set Environment Variable:
   - `VITE_API_URL`: Your Render backend API URL (e.g., `https://shivam-attendance-backend.onrender.com/api/v1`).

---

## 6. Architecture & Implementation Documentation

Detailed documentation is available in the `docs/` directory:
- [Phase 2 Completion & Audit Report](docs/phase-2-completion-audit.md)
- [Architecture Specification](docs/architecture.md)
- [Database Schema Design](docs/database-schema.md)
- [Attendance Workflow & State Machine](docs/attendance-workflow.md)
- [QR Cryptographic Security](docs/qr-security.md)
- [Implementation Plan](docs/implementation-plan.md)

---
*Shivam Patsanstha Digital Attendance System – Production PWA Ready.*
