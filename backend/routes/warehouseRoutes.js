const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');

// List all warehouses (Central, State, District)
router.get('/', async (req, res) => {
  try {
    const snap = await db.collection('warehouses').get();
    const warehouses = snap.docs.map(d => d.data());

    // Enrich with batches and current stock
    for (const wh of warehouses) {
      const batchesSnap = await db.collection('stockBatches').where('warehouseId', '==', wh.id).get();
      const batches = batchesSnap.docs.map(b => b.data());
      wh.activeBatchesCount = batches.length;
      wh.totalStockKg = batches.reduce((acc, b) => acc + Number(b.availableQuantity || 0), 0);
    }

    res.json({ success: true, count: warehouses.length, warehouses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get warehouse details with all its stock batches
router.get('/:id', async (req, res) => {
  try {
    const whId = req.params.id;
    const doc = await db.collection('warehouses').doc(whId).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Warehouse not found.' });
    }

    const warehouse = doc.data();
    const batchesSnap = await db.collection('stockBatches').where('warehouseId', '==', whId).get();
    warehouse.batches = batchesSnap.docs.map(b => b.data());

    res.json({ success: true, warehouse });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

