# Shivam Patsanstha – Digital Attendance Management System

A production-minded, mobile-first Progressive Web Application (PWA) engineered specifically for **Shivam Patsanstha**. The application automates staff attendance using an official printable permanent QR code standee/poster bound to a 100-meter hardware GPS Geofence and an offline-first auto-sync engine, auto-determining the daily four-step attendance lifecycle (`OFFICE_IN` → `LUNCH_BREAK_OUT` → `LUNCH_BREAK_IN` → `OFFICE_OUT`), backed by server-authoritative timestamps in Indian Standard Time (`Asia/Kolkata`).

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
│   ├── tests/                  # Pytest test suite (39 tests passing with 100% success)
│   ├── requirements.txt        # Python dependencies
│   └── main.py                 # FastAPI application entrypoint
├── frontend/                   # React 19+ TypeScript PWA
│   ├── public/                 # PWA icons & manifest assets
│   ├── src/
│   │   ├── components/         # Glassmorphic UI (GlassCard, Button, Badge, ShivamLogo, SplashScreen)
│   │   ├── contexts/           # AuthContext, LanguageContext (EN / MR), OfflineContext
│   │   ├── features/           # Domain modules (auth, attendance, admin)
│   │   ├── i18n/               # Bilingual dictionary (English & Marathi)
│   │   ├── services/           # Typed Axios API client & IndexedDB offline storage
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
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS with custom glassmorphism, React Router 7, Lucide React icons, `vite-plugin-pwa` (offline service worker + web app manifest), `html5-qrcode` mobile scanner, high-res canvas generator, IndexedDB offline database.
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

### B. Official Printable Office QR Poster & 100m GPS Geofence Security
- **No Kiosk Display Screens Required**: Specially designed for rural cooperative branches. Eliminates the cost, power outages, and maintenance issues of dedicated tablet/kiosk displays.
- **Printable High-Res Poster**: Super Admin & Admin can download a high-resolution 1500×1500px PNG or an official vector-sharp A4 PDF poster directly from the Admin Panel to print, frame, and paste on the branch counter or entrance wall.
- **Tamper-Proof Geofencing Anchor**: Even though the printed QR code is static, it cannot be spoofed remotely. The server evaluates the employee's phone GPS coordinates via the Haversine formula against registered office coordinates (`18.1361880, 74.5104810`). An employee attempting to scan a photo of the QR from home is immediately blocked by the 100-meter radius boundary check.
- **Offline-First Storage & Auto-Sync**: Smartphones retain satellite GPS (GNSS) positioning even without cellular reception or Wi-Fi. In areas with power cuts or spotty 2G/3G signal, attendance records are stored locally in IndexedDB and synchronized automatically in chronological batches (`POST /api/v1/attendance/sync-offline`) when connectivity restores.

### C. Physical Presence Verification & Server-Side GPS Geofencing (Phase 2.3)
- **Zero Third-Party Dependency**: Uses browser native HTML5 Geolocation API (`enableHighAccuracy: true`). Zero paid Google Maps or external tracking subscriptions.
- **Server-Side Final Authority**: Distance is calculated on the backend via the Haversine formula against official registered office coordinates (`18.1361880, 74.5104810`).
- **100m Permitted Geofence Radius**: Rejects attendance scans submitted outside the 100-meter office perimeter.
- **Accuracy Thresholds**: $\le 50$m preferred, $\le 100$m accepted, $> 100$m rejected with clear user retry guidance.
- **Replay Protection**: Rejects coordinates older than 120 seconds.
- **Privacy Preservation**: Raw employee coordinates are never logged or exposed in staff-facing views. Only the calculated distance (`verified_distance_meters`) and reported accuracy (`reported_accuracy_meters`) are persisted.
- **Super Admin Dynamic Calibration**: Super Admin can inspect and update office coordinates and geofence radius directly from the Admin Panel with mandatory audit justification.
- **Audited Manual Exceptions**: Admins can log manual attendance for broken phones, recorded with `verification_method="MANUAL_ADMIN"` and reason logging.

### D. Bilingual PDF Reports (English & Marathi Devanagari)
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
- When testing on a physical phone over plain `http://10.138.97.213:5173`, staff registration, PIN login, dashboards, reports, and GPS check-ins work completely.
- To test the **live phone camera** against the printed QR poster:
  - **Option A (Cloudflare Tunnel - Recommended & Free)**:
    ```bash
    npx cloudflared tunnel --url http://localhost:5173
    ```
    Open the generated `https://xxxx.trycloudflare.com` link on your phone.
  - **Option B (Ngrok)**:
    ```bash
    ngrok http 5173
    ```
  - **Option C (Direct Physical GPS Check-In / Offline Fallback)**:
    Tap "Physical GPS Check-In (No Screen Needed)" directly in the scanner modal on your phone to register attendance with verified hardware GPS location.

---

## 4. Running the Automated Test Suite

All 21 backend tests validate PIN authentication, rate limiting, the attendance state machine, QR cryptographic integrity, admin audit logging, PDF report generation, and role management.

```powershell
cd "c:\Users\Mohit\Desktop\SP Records\backend"
$env:PYTHONPATH="."
.\venv\Scripts\pytest.exe tests -v
```

### Test Coverage Summary (39 Tests Passing):
- **Admin & Audit Trails (`test_admin_audit.py`)**: Manual attendance addition, corrections with immutable audit log, and daily monitor verification.
- **Attendance State Machine (`test_attendance_state_machine.py`)**: 4-step sequence (`OFFICE_IN` → `LUNCH_BREAK_OUT` → `LUNCH_BREAK_IN` → `OFFICE_OUT` → terminal completion).
- **Authentication & RBAC (`test_auth.py`)**: PIN hashing, login lockouts, admin PIN reset with justification, Super Admin bootstrap, JWT resolution.
- **Geofence Security (`test_geofence_security.py`)**: Haversine distance calculations, 100m geofence enforcement, accuracy thresholds, location timestamp freshness, Super Admin location calibration.
- **Offline Sync Engine (`test_offline_sync.py`)**: Local IndexedDB sync ingestion, chronological replay, outside-geofence rejection, poor accuracy rejection, idempotent deduplication.
- **QR Security (`test_qr_security.py`)**: Multi-user shared office QR scans, tampered signature rejections, cross-organization code rejections, debounce protection.
- **PDF Reports & Permissions (`test_reports_and_roles.py`)**: ReportLab English & Marathi Devanagari reports, monthly summaries, RBAC role guard enforcement.
- **Static Office QR Poster (`test_static_qr.py`)**: Static QR configuration endpoints, 100m geofence validation, vector A4 PDF poster generation.

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
