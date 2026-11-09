# Hyperledger Fabric Blockchain Setup & Smart Contract Deployment

## 1. Architecture
The Smart PDS Blockchain operates on **Hyperledger Fabric v2.5** to guarantee immutable, cryptographically verifiable provenance across the national supply chain:
- **Channel**: `pdschannel`
- **Chaincode**: `smartpds`
- **Endorsing Organizations**: Org1 (Ministry of Consumer Affairs & Civil Supplies)
- **Orderer**: Raft-based ordering service

---

## 2. Smart Contract Function Methods

| Function | Parameters | Description |
|---|---|---|
| `registerBatch` | `batchId, commodityId, commodityName, quantity, unit, procurementDate, warehouseId, supplier, expiryDate` | Registers a newly harvested or procured grain batch |
| `registerProcurement` | `procurementId, batchId, commodity, quantity, unit, mandiSource, warehouseId` | Logs mandi procurement origin and farmer MSP payments |
| `transferStock` | `transferId, batchId, sourceWarehouseId, destWarehouseId, quantity, vehicleNo, driverName` | Inter-warehouse grain buffer movement |
| `receiveStock` | `transferId, batchId, warehouseId, receivedQty, receivingOfficer` | Inward receipt check at destination warehouse |
| `dispatchToOffice` | `dispatchId, sourceWarehouseId, destOfficeId, batchItemsJson, vehicleNo, driverDetails` | Outward dispatch to fair price ration shop |
| `confirmOfficeReceipt` | `dispatchId, officeId, receivedItemsJson, officerId, discrepancy, remarks` | Physical weigh-in and reception at Fair Price Shop |
| `distributeRation` | `distributionId, customerId, rationCardNo, officeId, officerId, itemsJson, biometricProofRef` | Beneficiary ration handover with biometric reference |
| `recordStockAdjustment` | `adjustmentId, locationType, locationId, commodity, batchId, adjustedQty, reason, officerId` | Loss, moisture, or audit adjustment |
| `getBatchHistory` | `batchId` | Provenance trace from harvest to beneficiary |
| `getTransactionHistory` | `queryDocType` | Queries blocks & events |
| `verifyTransaction` | `assetId` | Validates cryptographic block integrity and state hash |

---

## 3. Launching Local Docker Network
```bash
cd blockchain/network
docker-compose up -d
```

To deploy chaincode:
```bash
cd ../scripts
chmod +x start-network.sh
./start-network.sh
```

## 4. Dual-State Ledger Resiliency
When the Fabric cluster is active, transactions are committed to the live Fabric channel with status `COMMITTED_LEDGER`.
If Docker or Fabric is not active on the machine, the system maintains a cryptographic SHA-256 ledger in `backend/data/blockchain_ledger.json` and marks events as `PENDING_BLOCKCHAIN`, ensuring total cryptographic transparency without breaking the application.

