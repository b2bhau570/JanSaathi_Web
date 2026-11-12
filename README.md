# Jan Saathi AI — Complete Telemedicine & Healthcare Intake Platform

**Production-grade, local-first clinical intake, triage, and doctor-assistance telemedicine platform.**

---

## 🌟 Overview

Jan Saathi AI is a comprehensive multilingual healthcare intake and clinical decision-support platform designed for rural clinics, primary healthcare centers (PHCs), hospital OPDs, and connected telemedicine kiosks.

### Core Capabilities

1. **Multilingual Patient Intake (Odia, Hindi, English)**:
   - Voice-first conversational interview powered by **Sarvam AI** (`bulbul:v3` TTS & `saaras` speech-to-text) and **ElevenLabs**.
   - Contextual medical reasoning & follow-up questions powered by **Google Gemini**.
   - Accessible form mode, WhatsApp bot integration, and kiosk touch modes.

2. **Automated Clinical Safety Triage**:
   - Comprehensive rule-based classification into `Emergency`, `Urgent`, `Elevated`, and `Normal`.
   - Real-time emergency escalation with sound and visual alert banners.

3. **Clinician Workspace & Decision Support**:
   - Priority case queue with instant triage filtering.
   - Patient consultation suite: complete transcript, medical records viewer, AI differential diagnoses, clinical notes, and prescription builder.
   - Automated PDF case reports and official prescription generation via **ReportLab**.

4. **PMBJP Subsidized Medicine Ordering**:
   - Integrated Jan Aushadhi & essential medicine catalog with real dosages, compositions, and MRP savings.
   - Direct patient medicine ordering tied to verified case IDs.

5. **Hardware Kiosk Telemetry Integration**:
   - Direct connection to the **ESP32-S3 Medical Kiosk** over Web Serial (USB) or REST API.
   - Real-time physiological telemetry: Pulse (BPM), Blood Oxygen (SpO2), Temperature (°C/°F), Blood Pressure, and ECG.
   - Telemetry directly attached to patient records as verified physical measurements.

6. **Zero Mock / Zero Fake Data**:
   - Clean initial database state: no synthetic demo cases, no test pills, no fake data simulators.
   - Pure production architecture with real authentication and secure encryption.

---

## 📁 Clean Project Structure (`D:\JanSaathi_Web`)

```
D:\JanSaathi_Web\
├── backend\
│   ├── app\
│   │   ├── routes\          # API endpoints (auth, patient, doctor, admin, hardware)
│   │   ├── services\        # AI reasoning, triage, PDF report, WhatsApp, telemetry
│   │   ├── auth.py          # Bcrypt hashing & JWT security
│   │   ├── cli.py           # Admin provisioning CLI
│   │   ├── config.py        # Settings & environment validation
│   │   ├── database.py      # SQLAlchemy session factory
│   │   ├── models.py        # ORM data models (12 tables)
│   │   └── schemas.py       # Pydantic v2 schemas
│   ├── data\
│   │   ├── db\              # SQLite database (jansaathi.db)
│   │   └── uploads\         # Patient medical documents
│   ├── .env                 # Live active API keys (Sarvam, ElevenLabs, Gemini)
│   ├── main.py              # FastAPI server entrypoint
│   └── requirements.txt     # Clean production dependencies
├── frontend\
│   ├── src\
│   │   ├── api\             # Client API wrappers (patient, doctor, admin)
│   │   ├── assets\          # Clean icons and brand graphics
│   │   ├── components\      # Hardware monitor, UI primitives, layouts
│   │   ├── contexts\        # AuthContext, LanguageContext
│   │   ├── data\            # Real PMBJP medicine catalog
│   │   ├── i18n\            # Trilingual dictionaries (EN, HI, OR)
│   │   ├── pages\           # 12 complete platform pages
│   │   ├── services\        # Audio streaming & speech services
│   │   ├── App.tsx          # Master router
│   │   └── index.css        # Editorial theme (Fraunces + Cream/Ink/Magenta)
│   ├── package.json         # React 19 + Vite + Tailwind CSS v4
│   └── vite.config.ts       # Reverse proxy to backend
├── hardware\
│   └── JanSaathi_ESP32_Medical_Kiosk\
│       └── JanSaathi_ESP32_Medical_Kiosk.ino  # ESP32-S3 firmware with DSP filtering
├── start_platform.ps1       # One-click startup for both backend & frontend
├── start_backend.ps1        # Start FastAPI backend
├── start_frontend.ps1       # Start React frontend
├── setup_admin.ps1          # Administrator account management CLI
└── README.md
```

---

## 🚀 Quick Start Guide

### 1. One-Click Full Stack Launch

Run from PowerShell:
```powershell
Set-Location "D:\JanSaathi_Web"
.\start_platform.ps1
```

This launches both servers simultaneously in separate terminals:
- **Backend API**: `http://127.0.0.1:8000` (API Docs: `http://127.0.0.1:8000/docs`)
- **Frontend Web Portal**: `http://localhost:5173`

---

### 2. Manual Startup

#### Backend
```powershell
cd "D:\JanSaathi_Web\backend"
.\venv\Scripts\Activate.ps1
python main.py
```

#### Frontend
```powershell
cd "D:\JanSaathi_Web\frontend"
npm run dev
```

---

## 🔑 Initial Administrator Account

An approved administrator account is pre-provisioned for immediate use:
- **Email**: `admin@jansaathi.org`
- **Password**: `AdminSecure123!`
- **Portal URL**: `http://localhost:5173/doctor/login`

To create additional administrators or rotate passwords:
```powershell
cd "D:\JanSaathi_Web"
.\setup_admin.ps1
```

---

## 🌐 Configured API Keys & Engines

The backend is configured with active keys in `D:\JanSaathi_Web\backend\.env`:

| Engine | Service | Status | Purpose |
|---|---|---|---|
| **Google Gemini** | `gemini-2.5-flash` | Active & Verified | Clinical reasoning, follow-ups, differential diagnoses |
| **Sarvam AI** | `bulbul:v3` & `saaras` | Active & Verified | High-fidelity Indian voice synthesis & STT in Odia/Hindi/English |
| **ElevenLabs** | Multilingual Studio v2 | Active & Verified | Physician voice synthesis |
| **ESP32 Telemetry** | Web Serial / REST | Active & Verified | Real-time sensor vital signs streaming |

---

## 📟 ESP32-S3 Medical Kiosk Setup

The firmware is located in `hardware/JanSaathi_ESP32_Medical_Kiosk/JanSaathi_ESP32_Medical_Kiosk.ino`.

### Pin Connections (ESP32-S3 N16R8):
- **INMP441 Microphone**: SD: `GPIO 4`, WS: `GPIO 5`, SCK: `GPIO 6`
- **DS18B20 Temp Probe**: Data: `GPIO 7` (with 4.7kΩ pull-up to 3.3V)
- **MAX30102 SpO2 / Pulse**: SDA: `GPIO 8`, SCL: `GPIO 9`
- **AD8232 ECG**: Analog Out: `GPIO 1`, LO+: `GPIO 2`, LO-: `GPIO 3`
- **WS2812 NeoPixel**: Built-in: `GPIO 48`

Plug the ESP32-S3 into the computer via USB and click **"Connect ESP32-S3 Kiosk"** on the Doctor Dashboard or Case Detail page. Real telemetry streams live directly into the browser and database!

