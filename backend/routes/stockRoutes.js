const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { requireAdmin } = require('../middleware/authMiddleware');
const blockchainService = require('../services/blockchainService');

// Helper to generate unique Batch ID (BATCH-RICE-2025-02, etc.)
async function generateBatchId(commodityName) {
  const code = (commodityName || 'COMM').toUpperCase().slice(0, 5);
  const year = new Date().getFullYear();
  const snap = await db.collection('stockBatches').get();
  const count = snap.docs.length + 1;
  const seq = String(count).padStart(2, '0');
  return `BATCH-${code}-${year}-${seq}`;
}

// List all stock batches with search, filters & sort
router.get('/batches', async (req, res) => {
  try {
    const { commodity, warehouseId, search, status } = req.query;
    let docs = (await db.collection('stockBatches').get()).docs.map(d => d.data());

    if (commodity) {
      docs = docs.filter(b => b.commodityName?.toLowerCase() === commodity.toLowerCase());
    }
    if (warehouseId) {
      docs = docs.filter(b => b.warehouseId === warehouseId);
    }
    if (status) {
      docs = docs.filter(b => b.status === status.toUpperCase());
    }
    if (search) {
      const q = search.toLowerCase();
      docs = docs.filter(b =>
        b.batchId.toLowerCase().includes(q) ||
        b.commodityName.toLowerCase().includes(q) ||
        (b.supplier && b.supplier.toLowerCase().includes(q))
      );
    }

    // Sort by procurement date desc
    docs.sort((a, b) => new Date(b.procurementDate) - new Date(a.procurementDate));

    res.json({ success: true, count: docs.length, batches: docs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get commodity aggregates (total stock across warehouses & offices)
router.get('/inventory', async (req, res) => {
  try {
    const batchesSnap = await db.collection('stockBatches').get();
    const batches = batchesSnap.docs.map(d => d.data());

    const warehouseTotals = {};
    batches.forEach(b => {
      const comm = (b.commodityName || 'Other').toLowerCase();
      warehouseTotals[comm] = (warehouseTotals[comm] || 0) + Number(b.availableQuantity || 0);
    });

    const officeInvSnap = await db.collection('officeInventory').get();
    const officeTotals = { rice: 0, wheat: 0, sugar: 0, dal: 0 };
    officeInvSnap.docs.forEach(d => {
      const inv = d.data().inventory || {};
      for (const [k, v] of Object.entries(inv)) {
        officeTotals[k] = (officeTotals[k] || 0) + Number(v || 0);
      }
    });

    res.json({
      success: true,
      warehouseInventory: warehouseTotals,
      officeInventory: officeTotals,
      totalStockKg: Object.values(warehouseTotals).reduce((a, b) => a + b, 0) + Object.values(officeTotals).reduce((a, b) => a + b, 0)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin Add Stock Batch & Commit to Blockchain
router.post('/add', requireAdmin, async (req, res) => {
  try {
    const {
      commodityName,
      quantity,
      unit,
      procurementDate,
      warehouseId,
      supplier,
      expiryDate
    } = req.body;

    if (!commodityName || !quantity || !warehouseId || !supplier) {
      return res.status(400).json({
        success: false,
        message: 'Commodity Name, Quantity, Warehouse, and Supplier are required.'
      });
    }

    const batchId = await generateBatchId(commodityName);
    const qty = Number(quantity);

    const batchRecord = {
      id: batchId,
      batchId,
      commodityId: `COMM-${commodityName.toUpperCase()}`,
      commodityName,
      quantity: qty,
      availableQuantity: qty,
      unit: unit || 'KG',
      procurementDate: procurementDate || new Date().toISOString().slice(0, 10),
      warehouseId,
      supplier,
      expiryDate: expiryDate || 'N/A',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      createdBy: req.user.uid || 'admin'
    };

    // Save to Firestore
    await db.collection('stockBatches').doc(batchId).set(batchRecord);

    // Commit to Hyperledger Fabric Smart Contract (registerProcurement & registerBatch)
    const blockchainReceipt = await blockchainService.registerProcurement({
      procurementId: 'PROC-' + batchId,
      batchId,
      commodity: commodityName,
      quantity: qty,
      unit: batchRecord.unit,
      mandiSource: supplier,
      warehouseId
    });

    res.status(201).json({
      success: true,
      message: `Stock batch ${batchId} created and recorded on Blockchain ledger.`,
      batch: batchRecord,
      blockchain: blockchainReceipt
    });
  } catch (error) {
    console.error('Error adding stock batch:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Stock Adjustment
router.post('/adjust', requireAdmin, async (req, res) => {
  try {
    const { batchId, adjustedQty, reason } = req.body;
    if (!batchId || adjustedQty === undefined || !reason) {
      return res.status(400).json({ success: false, message: 'Batch ID, adjusted quantity, and reason are required.' });
    }

    const doc = await db.collection('stockBatches').doc(batchId).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Batch not found.' });
    }

    const batch = doc.data();
    const newQty = Math.max(0, Number(batch.availableQuantity) + Number(adjustedQty));

    await db.collection('stockBatches').doc(batchId).update({
      availableQuantity: newQty,
      lastAdjustmentReason: reason,
      lastAdjustedAt: new Date().toISOString()
    });

    const adjustmentId = 'ADJ-' + Date.now();
    const blockchainReceipt = await blockchainService.recordStockAdjustment({
      adjustmentId,
      locationType: 'warehouse',
      locationId: batch.warehouseId,
      commodity: batch.commodityName,
      batchId,
      adjustedQty: Number(adjustedQty),
      reason,
      officerId: req.user.uid || 'admin'
    });

    res.json({
      success: true,
      message: `Batch ${batchId} adjusted by ${adjustedQty} KG. New available: ${newQty} KG.`,
      availableQuantity: newQty,
      blockchain: blockchainReceipt
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

