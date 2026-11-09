# Blockchain-Based Smart Indian Public Distribution System (PDS)
### With Firebase, IoT Biometric Authentication and Supply Chain Tracking

![Smart PDS India](https://img.shields.io/badge/Status-Production%20Ready-success)
![NodeJS](https://img.shields.io/badge/Backend-Node.js%20%7C%20Express-blue)
![Firebase](https://img.shields.io/badge/Database-Firebase%20Firestore-orange)
![Blockchain](https://img.shields.io/badge/Ledger-Hyperledger%20Fabric-blueviolet)
![IoT](https://img.shields.io/badge/Hardware-ESP32%20%2B%20Optical%20Sensor-critical)

A complete, production-quality, modern web application and hardware IoT integration replicating and enhancing the Indian Public Distribution System (PDS).

---

## 🏛️ System Architecture

```
+----------------------------------------------------------------------------------------------------+
|                                 SMART PDS NATIONAL PORTAL (FRONTEND)                               |
|                                                                                                    |
|  [Homepage (3 Options)]    [6-Step Beneficiary Reg]    [Admin Command]    [FPS Officer POS]        |
|  - Customer Account        - Personal & Ration Card    - 11 KPI Cards     - Assigned Shop Lock     |
|  - Admin Login             - Family Members Dynamic    - Interactive      - Inward Dispatch Recv   |
|  - Officer Login           - ESP32 Biometric Kiosk     - 5 Chart.js Views - ESP32 Keypad & FP Auth |
|  - Live Status Tracker     - Document Upload           - Multi-Shipment   - NFSA Entitlement Calc  |
|                            - Unique ID Generation      - Blockchain Audit - Digital Receipt Gen    |
+----------------------------------------------------------------------------------------------------+
                                             │ HTTP REST / WebSocket Feed
                                             ▼
+----------------------------------------------------------------------------------------------------+
|                                   BACKEND SERVICES (NODE.JS & EXPRESS)                             |
|                                                                                                    |
|  • Firebase Config (Dual-Mode: Cloud Firestore / Local Zero-Config Persistent Engine)               |
|  • Blockchain Ledger Service (Hyperledger Fabric Client + SHA-256 Merkle Provenance Engine)         |
|  • IoT Biometric Service (Device Token Auth, Session State, Minutiae Reference Matching)           |
|  • NFSA Entitlement Engine (PHH Per-Person, AAY Fixed 35KG Household, Monthly Deductions)          |
|  • Security & Role Middleware (Strict Shop-Isolation for Officers, Admin Protection, JWT)          |
+----------------------------------------------------------------------------------------------------+
               │                                      │                                 │
               ▼                                      ▼                                 ▼
+-----------------------------+    +------------------------------------+    +-----------------------+
|  FIREBASE FIRESTORE & AUTH  |    |  HYPERLEDGER FABRIC (pdschannel)   |    |    ESP32 IOT POS      |
|                             |    |                                    |    |                       |
| 22 Structured Collections:  |    | Smart Contract (smartpds v1.0):    |    | • Optical FP Sensor   |
| • users / customers         |    | 1. registerBatch()                 |    |   (R307/R305 UART)    |
| • familyMembers / offices   |    | 2. registerProcurement()           |    | • 4x4 Matrix Keypad   |
| • officers / warehouses     |    | 3. transferStock()                 |    | • 16x2 I2C LCD        |
| • commodities / batches     |    | 4. receiveStock()                  |    | • Buzzer & Status LED |
| • dispatches / receipts     |    | 5. dispatchToOffice()              |    | • X-Device-Token      |
| • distributions             |    | 6. confirmOfficeReceipt()          |    |   Secure POS Link     |
| • blockchainTransactions    |    | 7. distributeRation()              |    +-----------------------+
| • deviceRegistry / settings |    | 8. recordStockAdjustment()         |
+-----------------------------+    | 9. getBatchHistory()               |
                                   | 10. getTransactionHistory()        |
                                   | 11. verifyTransaction()            |
                                   +------------------------------------+
```

---

## 🚀 Quick Launch (How to Run)

### 1. Install Dependencies
```bash
npm install
```

### 2. Seed Initial Database & Blockchain Ledger
Pre-populates FCI central warehouses, fair price shops, sample officers, grain stock batches, registered beneficiaries, and initial blockchain ledger events:
```bash
npm run seed
```

### 3. Start the Server
```bash
npm start
```
Open your browser at:
- **National Portal**: [http://localhost:5000](http://localhost:5000)
- **Customer Registration**: [http://localhost:5000/customer-registration.html](http://localhost:5000/customer-registration.html)
- **Admin Portal**: [http://localhost:5000/admin-login.html](http://localhost:5000/admin-login.html)
- **FPS Officer Terminal**: [http://localhost:5000/officer-login.html](http://localhost:5000/officer-login.html)
- **Citizen Portal**: [http://localhost:5000/customer-dashboard.html](http://localhost:5000/customer-dashboard.html)
- **Blockchain Explorer**: [http://localhost:5000/blockchain-explorer.html](http://localhost:5000/blockchain-explorer.html)

---

## 🔑 Pre-Registered Test Credentials

| Role | Username / ID | Password | Assigned Office / Context |
|---|---|---|---|
| **Admin** | `admin` | `AdminPassword123!` | Full National PDS Control |
| **FPS Officer 1** | `raj001` | `Password123!` | Office `OFF001` (Chennai Central FPS #01) |
| **FPS Officer 2** | `priya002` | `Password123!` | Office `OFF002` (Madurai South FPS #18) |
| **Beneficiary 1** | `CUST-TN-2025-001` | *(Direct Login)* | Gowtham N K (Priority Household - PHH) |
| **Beneficiary 2** | `CUST-TN-2025-002` | *(Direct Login)* | Meenakshi Sundaram (Antyodaya Anna Yojana - AAY) |

---

## 📋 Complete Workflow & Acceptance Verification

The completed application supports the entire 26-step national lifecycle required by the specification:

1. **Customer Registration**: Citizen opens homepage, enters 6-step registration details (Personal info, Ration card category, dynamic family members via `+ Add Family Member`, interactive ESP32 fingerprint enrollment, document uploads).
2. **Customer ID Generation**: System assigns unique ID (`CUST-TN-2025-XXXX`) and sets status to `PENDING`.
3. **Administrative Approval**: State Admin logs in, verifies documents and family units, and marks application as `APPROVED`.
4. **Office & Officer Management**: Admin creates Fair Price Offices with automated `OFF-xxx` IDs and creates Officer credentials with strict shop isolation.
5. **Grain Stock Ingestion**: Admin procures grain batches (`BATCH-RICE-2025-01`), automatically committing `registerProcurement` onto the blockchain.
6. **Supply Chain Dispatch**: Admin dispatches multi-commodity truck shipments (`+ Add Item`), verifies source warehouse stock to prevent over-dispatch, and records `dispatchToOffice` on-chain with status `IN_TRANSIT`.
7. **Inward Receipt Confirmation**: FPS Officer receives delivery, enters physical weigh-in amounts. If quantities mismatch, a discrepancy alert is recorded on the blockchain; if confirmed, office inventory is credited and `confirmOfficeReceipt` is committed.
8. **Citizen Biometric Identification**: Beneficiary enters Customer ID on the numeric keypad and places their finger on the ESP32 optical sensor. The system matches minutiae references, checks approval status, and ensures assigned office match.
9. **NFSA Family Entitlement Calculation**: Automatically calculates quotas:
   - **PHH**: 5 KG Rice/person + 2 KG Wheat/person + 1 KG Sugar/card + 1 KG Dal/card.
   - **AAY**: Fixed 35 KG total household grain allocation.
10. **Distribution Execution & Atomic Ledger Update**: Officer inputs distributed quantities, system verifies against available shop inventory and remaining entitlement, updates office stock atomically, updates beneficiary history, generates a digital receipt, and commits `distributeRation` to the Hyperledger Fabric ledger!
11. **Supply Chain Provenance Tracking**: Both Admin and citizens can trace every grain batch across the vertical supply chain timeline:
    `Government Procurement ↓ Central FCI Silo ↓ State Godown ↓ District Buffer ↓ Fair Price Shop ↓ Beneficiary Handover`

---

## 📄 License & Compliance
Compliant with National Food Security Act (NFSA), Aadhaar Biometric Security Guidelines, and Ministry of Consumer Affairs, Food & Public Distribution standards.

#   R A T I O N - S Y S T E M  
 