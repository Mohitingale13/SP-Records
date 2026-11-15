# Shivam Patsanstha – Digital Attendance Management System

A production-ready, mobile-first Progressive Web Application (PWA) engineered specifically for **Shivam Patsanstha**. The application automates staff attendance using an official printable permanent QR code standee/poster bound to a **50-meter hardware GPS Geofence** and an offline-first auto-sync engine, auto-determining the daily four-step attendance lifecycle (`OFFICE_IN` → `LUNCH_BREAK_OUT` → `LUNCH_BREAK_IN` → `OFFICE_OUT`), backed by server-authoritative timestamps in Indian Standard Time (`Asia/Kolkata`).

---

## 1. Project Architecture & Tech Stack

```
SP-Records/
├── backend/                    # Python FastAPI REST API
│   ├── alembic/                # Database migrations
│   ├── app/
│   │   ├── api/v1/             # Endpoints (auth, attendance, qr, admin, reports)
│   │   ├── assets/fonts/       # Bundled Noto Sans Devanagari TrueType fonts
│   │   ├── core/               # Config, JWT, HMAC QR security, Timezone (Asia/Kolkata)
│   │   ├── db/                 # Base model, SQLAlchemy engine & SessionLocal
│   │   ├── models/             # Lean SQLAlchemy 2.0 ORM models (5 core tables)
│   │   ├── schemas/            # Pydantic v2 schemas
│   │   └── services/           # Business logic: State Machine, QR engine, Auth, PDF Reports
│   ├── tests/                  # Pytest test suite (40 tests passing with 100% success)
│   ├── requirements.txt        # Python dependencies
│   └── main.py                 # FastAPI application entrypoint with HEAD/GET keep-alive
├── frontend/                   # React 19+ TypeScript PWA
│   ├── public/                 # PWA icons & manifest assets
│   ├── src/
│   │   ├── components/         # Glassmorphic UI, ScrollTimePicker, ErrorBoundary, SplashScreen
│   │   ├── contexts/           # AuthContext, LanguageContext (EN / MR), OfflineContext
│   │   ├── features/           # Domain modules (auth, attendance, admin)
│   │   ├── i18n/               # Bilingual dictionary (English & Marathi)
│   │   ├── services/           # Typed Axios API client & IndexedDB offline storage
│   │   ├── styles/             # Tailwind design tokens & custom glassmorphism
│   │   └── types/              # TypeScript interfaces mirroring API
│   ├── package.json
│   ├── tailwind.config.js
│   ├── vercel.json             # Vercel deployment configuration
│   └── vite.config.ts          # Vite configuration with PWA plugin
├── docs/                       # Architecture & technical specifications
│   ├── architecture.md
│   ├── database-schema.md
│   ├── attendance-workflow.md
│   └── qr-security.md
├── render.yaml                 # Render backend deployment spec
├── vercel.json                 # Vercel root deployment spec
└── README.md
```

### Technology Highlights:
- **Backend**: Python 3.10+, FastAPI, SQLAlchemy 2.x, Alembic, Pydantic v2, ReportLab with embedded Unicode Devanagari TrueType fonts, `python-jose` (HS256 JWT & stateless HMAC QR), native `bcrypt` PIN hashing, PostgreSQL (Neon Cloud Database) / SQLite for local development.
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS with custom glassmorphism, React Router 7, Lucide React icons, `vite-plugin-pwa` (offline service worker + web app manifest), `html5-qrcode` mobile scanner, IndexedDB offline buffer, global `ErrorBoundary` for fault tolerance.
- **Authentication**: Zero external SMS/OTP gateway dependency. Secure authentication via **Full Name + Mobile Number + 6-digit numeric PIN** with bcrypt hashing, progressive lockouts for repeated failed attempts, and administrative PIN reset with mandatory audit reason logging.
- **Design System**: Frosted glass cards, translucent surfaces (`rgba(255, 255, 255, 0.55)`), soft cyan/turquoise accents (`#00C7C7`, `#36BFCB`), watery teal background (`#B8F2EC` to `#C4F7F2`), dark teal typography (`#153B43`), Devanagari typography support (`Mukta` & `Noto Sans Devanagari`).
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

### B. Official Printable Office QR Poster & 50m GPS Geofence Security
- **No Kiosk Display Screens Required**: Specially designed for rural cooperative branches. Eliminates the cost, power outages, and maintenance issues of dedicated tablet/kiosk displays.
- **Printable High-Res Poster**: Super Admin & Admin can download a high-resolution 1500×1500px PNG or an official vector-sharp A4 PDF poster directly from the Admin Panel to print, frame, and paste on the branch counter or entrance wall.
- **Tamper-Proof Geofencing Anchor**: Even though the printed QR code is permanent, it cannot be spoofed remotely. The server evaluates the employee's phone GPS coordinates via the Haversine formula against registered office coordinates (`18.1361880, 74.5104810`). An employee attempting to scan a photo of the QR from home is immediately blocked by the **50-meter radius boundary check**.
- **Offline-First Storage & Auto-Sync**: Smartphones retain satellite GPS (GNSS) positioning even without cellular reception or Wi-Fi. In areas with power cuts or spotty 2G/3G signal, attendance records are stored locally in IndexedDB and synchronized automatically in chronological batches (`POST /api/v1/attendance/sync-offline`) when connectivity restores.

### C. Physical Presence Verification & Server-Side GPS Geofencing
- **Zero Third-Party Dependency**: Uses browser native HTML5 Geolocation API (`enableHighAccuracy: true`). Zero paid Google Maps or external tracking subscriptions.
- **Server-Side Final Authority**: Distance is calculated on the backend via the Haversine formula against official registered office coordinates (`18.1361880, 74.5104810`).
- **50m Permitted Geofence Radius**: Rejects attendance scans submitted outside the 50-meter office perimeter.
- **Accuracy Thresholds**: $\le 30$m preferred, $\le 50$m accepted, $> 50$m rejected with clear user retry guidance.
- **Replay Protection**: Rejects coordinates older than 120 seconds.
- **Privacy Preservation**: Raw employee coordinates are never logged or exposed in staff-facing views. Only the calculated distance (`verified_distance_meters`) and reported accuracy (`reported_accuracy_meters`) are persisted.
- **Super Admin Dynamic Calibration**: Super Admin can inspect and update office coordinates and geofence radius directly from the Admin Panel with mandatory audit justification.
- **Audited Manual Exceptions**: Admins can log manual attendance for broken phones, recorded with `verification_method="MANUAL_ADMIN"` and reason logging.

### D. Staff Attendance Records & 2.5-Second Hold Menu
- **Date-wise Collapsible Inspection**: Today's attendance events are expanded and directly visible by default. Past calendar dates render as compact, collapsible summary cards showing date, status badge, and punch count (`4/4`); clicking any past date expands or collapses its punches.
- **2.5-Second Hold Management Action Menu**: Holding down on any staff member's row for 2.5 seconds pops up a dedicated action menu with two distinct cards:
  1. **Reset Staff PIN**: Allows assigning a new 6-digit numeric login PIN with mandatory reason logging.
  2. **Delete Staff Member**: Opens a destructive confirmation warning dialogue to permanently remove mistaken/duplicate staff accounts and cascade-delete their attendance records with an audit log (`STAFF_DELETION`).
- **Scrolling 12-Hour Time Wheel**: Manual attendance entry and record corrections use an intuitive scrolling 12-hour clock selector (Hours `1-12`, Minutes `00-59`, `AM/PM`).

### E. Bilingual PDF Reports (English & Marathi Devanagari)
- **Weekly & Monthly Attendance PDF Reports**: Generated on-demand via ReportLab.
- **Devanagari Font Rendering**: Bundles `NotoSansDevanagari-Regular.ttf` and `NotoSansDevanagari-Bold.ttf` for pristine Marathi script rendering.
- **Role Guard**: Restricted to `ADMIN` and `SUPER_ADMIN`; regular staff accessing the PDF endpoints are rejected with HTTP 403 Forbidden.

---

## 3. Database Schema Overview (Neon Cloud PostgreSQL)

The database consists of **5 lean, normalized core tables** (plus Alembic's migration tracker):

| Table Name | Description |
| :--- | :--- |
| **`organizations`** | Institution identity (`Shivam Patsanstha`), office coordinates (`18.1361880, 74.5104810`), 50m geofence radius. |
| **`roles`** | `SUPER_ADMIN`, `ADMIN`, `STAFF`. |
| **`users`** | Staff accounts, E.164 phone numbers, bcrypt-hashed 6-digit PINs, account lockout status. |
| **`attendance_records`** | Daily events (`OFFICE_IN`, `LUNCH_BREAK_OUT`, `LUNCH_BREAK_IN`, `OFFICE_OUT`), IST timestamps, verified distance. |
| **`attendance_audit_logs`** | Complete audit trail for manual corrections, time adjustments, PIN resets, and staff deletions. |
| **`alembic_version`** | Database schema version tracking. |

*QR verification is 100% stateless (cryptographic HMAC-SHA256 signature + 50m GPS geofencing), eliminating unnecessary database write locks.*

---

## 4. Production Deployment Setup

The application is deployed on high-availability free tiers:

```
[Staff / Admin Devices]
        │
        ├─── Static Assets (PWA) ───► Vercel (Edge CDN, Instant Load)
        │
        └─── REST API & Auth    ───► Render (Python FastAPI Backend)
                                           │
                                           └───► Neon (Serverless PostgreSQL)
```

### Keeping Render Backend Awake 24/7 (UptimeRobot)
Render's free tier spins down web services after 15 minutes of inactivity. To keep it awake 24/7 with zero cold starts:
1. Create a free account at [UptimeRobot](https://uptimerobot.com/).
2. Add a new monitor:
   - **Monitor Type**: `HTTP(s)`
   - **URL**: `https://<YOUR-RENDER-BACKEND-URL>/health`
   - **HTTP Method**: `HEAD` or `GET` (Both return `200 OK`)
   - **Monitoring Interval**: `5 minutes` or `10 minutes`
3. The `/health` endpoint responds directly from memory without querying the database, keeping Render warm while allowing Neon Postgres to sleep at night (conserving Neon compute hours).

---

## 5. Local Development & Testing

### Step 1: Start Backend
```powershell
cd "backend"
.\venv\Scripts\Activate.ps1
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Interactive Swagger API documentation: `http://localhost:8000/docs`

### Step 2: Start Frontend
```powershell
cd "frontend"
npm run dev
```
Local access: `http://localhost:5173`

### Step 3: Run Backend Test Suite (40/40 Tests Passing)
```powershell
cd "backend"
$env:PYTHONPATH="."
.\venv\Scripts\pytest.exe -v
```

### Step 4: Run Frontend Test Suite
```powershell
cd "frontend"
npm test -- --run
```

### Step 5: Production Build Verification
```powershell
cd "frontend"
npm run build
```

---

## 6. Security Architecture & Threat Model

| Threat | Attack Vector | System Defense |
| :--- | :--- | :--- |
| **Remote Proxy Attendance** | Employee photographs office QR poster and shares it with absent colleagues via WhatsApp. | **Server-Side GPS Geofence (50m)**: Device GPS coordinates are calculated on the backend via the Haversine formula against office coordinates (`18.1361880, 74.5104810`). An absent employee at home scanning the photo is immediately rejected. |
| **GPS Spoofing / Mock Location** | User uses mock GPS developer apps to spoof coordinates. | **Hardware GNSS Validation & Freshness**: Coordinates require high accuracy ($\le 50$m, preferred $\le 30$m) and timestamps $\le 120$s old. |
| **Rapid Duplicate Scans** | Staff member repeatedly taps or scans within seconds. | **Debounce Window**: Configurable minimum spacing (10s) enforced by server state machine. |
| **Token Forgery** | Attacker crafts a fake QR code. | **HMAC-SHA256 Cryptographic Signature & Org Scoping**: QR token encodes signed organization identifier and is validated against `QR_SIGNING_SECRET`. |
| **Rural Power / Network Cut** | Mobile data or Wi-Fi is unavailable at the branch. | **Offline IndexedDB Storage**: Smartphone GNSS satellites work without cellular data; check-ins are buffered in local IndexedDB and auto-synced upon reconnect (`POST /api/v1/attendance/sync-offline`). |
| **Brute-Force PIN Attack** | Attacker guesses 6-digit staff PIN. | **Progressive Delays & Account Lockout**: Lockout after 5 consecutive failed attempts; bcrypt-hashed passwords. |

---

*Shivam Patsanstha Digital Attendance System – Production PWA Ready.*
