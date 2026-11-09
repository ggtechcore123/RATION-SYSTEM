# Smart Indian Public Distribution System (PDS) - Installation & Setup Guide

## 1. System Overview
The Blockchain-Based Smart Indian Public Distribution System (PDS) is a state-of-the-art government technology platform combining:
- **Node.js & Express API Backend** with real-time WebSockets
- **Firebase Firestore, Authentication, and Storage** (Dual-mode: cloud-ready & local zero-config persistent engine)
- **Hyperledger Fabric Blockchain Ledger** with cryptographic batch provenance tracking
- **IoT Biometric ESP32 Integration** with Adafruit optical fingerprint sensor and 4x4 matrix keypad
- **Responsive Government Portal Frontend** (Customer Registration, Admin Command Portal, FPS Officer Terminal, Blockchain Explorer, Beneficiary Portal)

---

## 2. Prerequisites
- **Node.js**: v18.x, v20.x, or v24.x
- **npm**: v9.x or higher
- **Web Browser**: Chrome, Edge, Firefox, or Safari
- *(Optional for real hardware)*: ESP32 development board, Adafruit R307/R305 fingerprint sensor, 4x4 Keypad, 16x2 LCD
- *(Optional for Fabric Docker cluster)*: Docker & Docker Compose

---

## 3. Quick Start (1-Minute Launch)

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Seed Initial Data
Pre-populates the database with FCI central warehouses, fair price shops, sample officers, grain stock batches, registered beneficiaries, and initial blockchain ledger events:
```bash
npm run seed
```

### Step 3: Start the Application
```bash
npm start
```
The server will start at:
- **Web Portal**: [http://localhost:5000](http://localhost:5000)
- **API Health**: [http://localhost:5000/api/health](http://localhost:5000/api/health)
- **WebSocket Feed**: `ws://localhost:5000/ws/live`

Keep the `npm start` terminal open while using the portal. If the browser reports
"Failed to fetch", confirm the API Health URL above responds with `"status":"ONLINE"`.
Do not open an HTML file directly from disk; use `http://localhost:5000` so the
frontend and API are served by the application server.
In Windows PowerShell, use `npm.cmd start` if script execution blocks `npm start`.

---

## 4. Default Login Credentials

| Role | Username / ID | Password | Notes |
|---|---|---|---|
| **Admin** | `admin` | `AdminPassword123!` | Full national network control |
| **FPS Officer** | `raj001` | `Password123!` | Assigned to Office `OFF001` (Chennai) |
| **FPS Officer 2** | `priya002` | `Password123!` | Assigned to Office `OFF002` (Madurai) |
| **Beneficiary** | `CUST-TN-2025-001` or `RC-TN-772819` | *(Direct login)* | Gowtham N K (PHH Card, 4 Members) |

---

## 5. Directory Structure
```
smart-pds/
├── backend/
│   ├── config/             # Firebase & environment config
│   ├── controllers/        # Route controllers
│   ├── data/               # Persistent database & blockchain ledger JSON
│   ├── middleware/         # Role security, JWT, device authentication
│   ├── routes/             # REST API endpoints
│   ├── services/           # Blockchain, IoT, and Entitlement engines
│   └── server.js           # Server entry point
├── frontend/
│   ├── index.html          # National government technology homepage
│   ├── customer-registration.html # 6-Step beneficiary registration
│   ├── admin-login.html    # Admin sign-in
│   ├── officer-login.html  # Ration shop officer sign-in
│   ├── admin-dashboard.html# Full administrative management console
│   ├── officer-dashboard.html # FPS distribution & receiving terminal
│   ├── customer-dashboard.html# Beneficiary tracking portal
│   ├── blockchain-explorer.html # Blockchain transaction & batch explorer
│   ├── css/style.css       # Design system (Navy blue, emerald green)
│   └── js/                 # Client controllers and API clients
├── esp32/                  # ESP32 C++ firmware sketches & pinouts
├── blockchain/             # Hyperledger Fabric chaincode & docker network
├── firebase/               # Firestore security rules, storage rules & indexes
└── docs/                   # Setup and architecture documentation
```
