# Shivam Patsanstha – Implementation Plan

## Phase 1: Architectural Foundation & Core Engine (Current Phase)
The objective of Phase 1 is to construct an airtight, tested, and maintainable foundation across the entire full-stack system.

### Scope Checklist:
- [x] **Repository & Project Architecture**: Clean directory separation (`backend/`, `frontend/`, `docs/`).
- [x] **Architecture Documentation**: Complete specifications for Architecture, DB Schema, Attendance State Machine, and QR Security.
- [ ] **Backend Environment & Config**:
  - Python project dependencies (`requirements.txt`).
  - Strict Pydantic configuration (`app/core/config.py`).
  - Database engine and session lifecycle (`app/db/session.py`, `app/db/base.py`).
- [ ] **Database Models & Migrations**:
  - Declarative SQLAlchemy 2.0 models for Organization, User, Role, AttendanceRecord, AttendanceAuditLog, QRCode, OTPVerification.
  - Alembic configuration with initial migration generation.
- [ ] **Core Business Services**:
  - `AuthService`: Phone-based OTP generation & verification, JWT issuance, Super Admin bootstrap.
  - `AttendanceStateMachine`: Rule enforcement, next-event determination, collision handling.
  - `QRCodeService`: HMAC-SHA256 token generation, signature verification, expiration check, nonce tracking.
- [ ] **API Endpoint Hierarchy (`/api/v1`)**:
  - `/auth`: request-otp, verify-otp, me.
  - `/attendance`: current-status, scan, history.
  - `/qr`: rotate, validate.
  - `/admin`: staff-list, corrections, audit-logs.
- [ ] **Frontend Foundation**:
  - Vite + React + TypeScript + Tailwind CSS initialization.
  - Custom glassmorphism design tokens (aqua/watery blue palette).
  - PWA manifest, service worker setup (`vite-plugin-pwa`), mobile viewport meta.
  - Centralized bilingual translation dictionary (English & Marathi) with Devanagari typography support.
  - Typed API client and Auth/Language context providers.
- [ ] **Automated Test Suite**:
  - Unit tests for Attendance State Machine transitions & boundary conditions.
  - Unit tests for QR cryptographic signing and expiration.
  - Integration tests for Phone/OTP authentication & role authorization.
- [ ] **Documentation**: Developer guide in `README.md`.

---

## Phase 2: Full UI Implementation, Camera Hardware & Production Polish
- Staff PWA Screens: Onboarding, Scanner with live camera feed, Attendance History with calendar view.
- Office QR Poster & Standee: Printable high-resolution PNG & vector A4 PDF poster with 100m GPS geofencing & offline auto-sync.
- Admin Suite: Real-time presence monitor, Manual correction dialog with reason validation, Employee management, Super Admin role assignment.
- Report Generation: Weekly & Monthly PDF export with Marathi font rendering.
- Deployment Pipelines: Render (Backend), Vercel (Frontend), Neon (PostgreSQL).

