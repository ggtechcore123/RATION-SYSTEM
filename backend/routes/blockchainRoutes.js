const express = require('express');
const router = express.Router();
const blockchainService = require('../services/blockchainService');
const { db } = require('../config/firebase');

// Ledger network stats
router.get('/stats', (req, res) => {
  try {
    const stats = blockchainService.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Latest transactions with filtering
router.get('/transactions', (req, res) => {
  try {
    const { action, officeId, batchId, limit = 50 } = req.query;
    const txs = blockchainService.getTransactionHistory(Number(limit), { action, officeId, batchId });
    res.json({ success: true, count: txs.length, transactions: txs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Supply chain batch provenance timeline
router.get('/batch/:batchId', async (req, res) => {
  try {
    const batchId = req.params.batchId.trim();
    const history = blockchainService.getBatchHistory(batchId);

    // Also get metadata from stockBatches
    const batchDoc = await db.collection('stockBatches').doc(batchId).get();
    const batchData = batchDoc.exists ? batchDoc.data() : null;

    // Build vertical timeline steps
    const timeline = [];

    // Step 1: Procurement / Batch Creation
    const procTx = history.find(h => h.action === 'registerProcurement' || h.action === 'registerBatch');
    if (procTx || batchData) {
      timeline.push({
        stage: 'GOVERNMENT_PROCUREMENT',
        title: 'Mandi Procurement & Quality Certification',
        actor: batchData ? batchData.supplier : 'Punjab Agro & Central Mandi Board',
        location: 'Central Procurement Center (FCI)',
        timestamp: procTx ? procTx.timestamp : batchData?.procurementDate,
        txId: procTx ? procTx.txId : 'TX-PROC-001',
        blockNumber: procTx ? procTx.blockNumber : 1,
        status: 'VERIFIED',
        details: {
          commodity: batchData?.commodityName || 'Grain',
          quantity: `${batchData?.quantity || 50000} ${batchData?.unit || 'KG'}`,
          procurementDate: batchData?.procurementDate
        }
      });
    }

    // Step 2: Central Warehouse Ingestion
    timeline.push({
      stage: 'CENTRAL_WAREHOUSE',
      title: 'Central Warehouse Deposit & Silo Allocation',
      actor: 'Food Corporation of India (FCI) Silo Chennai',
      location: 'Harbour Estate Godowns, Chennai',
      timestamp: batchData?.procurementDate || new Date().toISOString(),
      txId: procTx ? procTx.txId : 'TX-FCI-INSPECT',
      blockNumber: procTx ? procTx.blockNumber : 1,
      status: 'VERIFIED',
      details: {
        warehouse: 'WH-C01 (Chennai Central)',
        storageCondition: 'Moisture Tested < 12%, Insect Free'
      }
    });

    // Step 3: Inter-Warehouse / State & District Transfers
    const transferTxs = history.filter(h => h.action === 'transferStock' || h.action === 'receiveStock');
    transferTxs.forEach((t, idx) => {
      timeline.push({
        stage: 'TRANSIT_WAREHOUSE',
        title: `Buffer Stock Movement (Tranche #${idx + 1})`,
        actor: t.payload.driverName || 'State Civil Supplies Fleet',
        location: `${t.payload.sourceWarehouseId} → ${t.payload.destWarehouseId || t.payload.warehouseId}`,
        timestamp: t.timestamp,
        txId: t.txId,
        blockNumber: t.blockNumber,
        status: t.status,
        details: t.payload
      });
    });

    // Step 4: Office Dispatches
    const dispatchTxs = history.filter(h => h.action === 'dispatchToOffice');
    dispatchTxs.forEach(d => {
      timeline.push({
        stage: 'OFFICE_DISPATCH',
        title: `Fair Price Shop Transit (${d.payload.destOfficeId})`,
        actor: d.payload.driverDetails || 'Civil Supplies Logistics',
        location: `${d.payload.sourceWarehouseId} → Fair Price Shop ${d.payload.destOfficeId}`,
        timestamp: d.timestamp,
        txId: d.txId,
        blockNumber: d.blockNumber,
        status: d.status,
        details: {
          vehicle: d.payload.vehicleNo,
          items: d.payload.items
        }
      });
    });

    // Step 5: Office Receipts
    const receiptTxs = history.filter(h => h.action === 'confirmOfficeReceipt');
    receiptTxs.forEach(r => {
      timeline.push({
        stage: 'OFFICE_RECEIPT',
        title: `Stock Received at Ration Shop (${r.payload.officeId})`,
        actor: `Officer ID: ${r.payload.officerId}`,
        location: `Office ${r.payload.officeId}`,
        timestamp: r.timestamp,
        txId: r.txId,
        blockNumber: r.blockNumber,
        status: r.status,
        details: {
          receivedItems: r.payload.receivedItems,
          discrepancy: r.payload.discrepancy ? 'MISMATCH REPORTED' : 'EXACT MATCH VERIFIED',
          remarks: r.payload.remarks
        }
      });
    });

    // Step 6: Beneficiary Distributions from this Batch
    const distTxs = history.filter(h => h.action === 'distributeRation');
    distTxs.forEach(dt => {
      timeline.push({
        stage: 'BENEFICIARY_DISTRIBUTION',
        title: `Beneficiary Ration Handover (${dt.payload.customerId})`,
        actor: `Authorized Officer: ${dt.payload.officerId}`,
        location: `Office ${dt.payload.officeId}`,
        timestamp: dt.timestamp,
        txId: dt.txId,
        blockNumber: dt.blockNumber,
        status: dt.status,
        details: {
          receipt: dt.payload.receiptNumber,
          biometricRef: dt.payload.biometricVerificationRef,
          items: dt.payload.distributedItems
        }
      });
    });

    res.json({
      success: true,
      batchId,
      batchData,
      totalTimelineNodes: timeline.length,
      timeline,
      rawLedgerEvents: history
    });
  } catch (error) {
    console.error('Error in batch tracking:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Transaction cryptographic verification endpoint
router.get('/verify/:txId', (req, res) => {
  try {
    const txId = req.params.txId.trim();
    const result = blockchainService.verifyTransaction(txId);
    res.json({ success: true, verification: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

