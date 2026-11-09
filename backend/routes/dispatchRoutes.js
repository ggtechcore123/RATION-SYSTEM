const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { requireAdmin, requireOfficer } = require('../middleware/authMiddleware');
const blockchainService = require('../services/blockchainService');

// Generate Dispatch ID
async function generateDispatchId() {
  const currentYear = new Date().getFullYear();
  const snap = await db.collection('dispatches').get();
  const count = snap.docs.length + 1;
  return `DSP-${currentYear}-${String(count).padStart(3, '0')}`;
}

// Get dispatches list
router.get('/', async (req, res) => {
  try {
    const { officeId, status } = req.query;
    let docs = (await db.collection('dispatches').get()).docs.map(d => d.data());

    if (officeId) {
      docs = docs.filter(d => d.destinationOfficeId === officeId);
    }
    if (status) {
      docs = docs.filter(d => d.status === status.toUpperCase());
    }

    docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, count: docs.length, dispatches: docs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single dispatch details
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection('dispatches').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Dispatch record not found.' });
    }
    res.json({ success: true, dispatch: doc.data() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin Create Dispatch to Specific Office
router.post('/', requireAdmin, async (req, res) => {
  try {
    const {
      sourceWarehouseId,
      destinationOfficeId,
      vehicleNumber,
      driverDetails,
      dispatchDate,
      expectedDeliveryDate,
      remarks,
      items // Array of { commodity, batchId, quantity, unit }
    } = req.body;

    if (!sourceWarehouseId || !destinationOfficeId || !vehicleNumber || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Source Warehouse, Destination Office, Vehicle Number, and at least 1 dispatch item are required.'
      });
    }

    // Verify destination office
    const officeDoc = await db.collection('offices').doc(destinationOfficeId).get();
    if (!officeDoc.exists) {
      return res.status(404).json({ success: false, message: 'Destination office not found.' });
    }
    const officeData = officeDoc.data();

    // Verify source warehouse
    const whDoc = await db.collection('warehouses').doc(sourceWarehouseId).get();
    const whData = whDoc.exists ? whDoc.data() : { name: sourceWarehouseId };

    // 1. Verify warehouse stock & prevent dispatch beyond available stock
    for (const item of items) {
      const batchDoc = await db.collection('stockBatches').doc(item.batchId).get();
      if (!batchDoc.exists) {
        return res.status(400).json({
          success: false,
          message: `Batch ${item.batchId} for ${item.commodity} not found in inventory.`
        });
      }
      const batchData = batchDoc.data();
      const requestedQty = Number(item.quantity);
      if (requestedQty <= 0) {
        return res.status(400).json({ success: false, message: `Invalid quantity for ${item.commodity}.` });
      }
      if (requestedQty > Number(batchData.availableQuantity)) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock in Batch ${item.batchId} (${item.commodity}). Available: ${batchData.availableQuantity} KG, Requested: ${requestedQty} KG.`
        });
      }
    }

    // 2. Deduct warehouse stock atomically
    for (const item of items) {
      const batchDoc = await db.collection('stockBatches').doc(item.batchId).get();
      const batchData = batchDoc.data();
      const newAvail = Number(batchData.availableQuantity) - Number(item.quantity);
      await db.collection('stockBatches').doc(item.batchId).update({
        availableQuantity: newAvail
      });
    }

    // 3. Create dispatch record
    const dispatchId = await generateDispatchId();
    const dispatchRecord = {
      id: dispatchId,
      dispatchId,
      sourceWarehouseId,
      sourceWarehouseName: whData.name,
      destinationOfficeId,
      destinationOfficeName: officeData.officeName,
      vehicleNumber: vehicleNumber.trim().toUpperCase(),
      driverDetails: driverDetails ? driverDetails.trim() : 'N/A',
      dispatchDate: dispatchDate || new Date().toISOString().slice(0, 10),
      expectedDeliveryDate: expectedDeliveryDate || new Date().toISOString().slice(0, 10),
      remarks: remarks || '',
      items: items.map(i => ({
        commodity: i.commodity,
        batchId: i.batchId,
        quantity: Number(i.quantity),
        unit: i.unit || 'KG'
      })),
      status: 'IN_TRANSIT',
      createdAt: new Date().toISOString(),
      dispatchedBy: req.user.uid || 'admin'
    };

    await db.collection('dispatches').doc(dispatchId).set(dispatchRecord);

    // 4. Record to Hyperledger Fabric Blockchain Smart Contract
    const blockchainReceipt = await blockchainService.dispatchToOffice({
      dispatchId,
      sourceWarehouseId,
      destOfficeId: destinationOfficeId,
      items: dispatchRecord.items,
      vehicleNo: dispatchRecord.vehicleNumber,
      driverDetails: dispatchRecord.driverDetails
    });

    res.status(201).json({
      success: true,
      message: `Dispatch ${dispatchId} initiated successfully. Items marked IN_TRANSIT and recorded on Blockchain.`,
      dispatch: dispatchRecord,
      blockchain: blockchainReceipt
    });
  } catch (error) {
    console.error('Error creating dispatch:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Officer Confirm Stock Receipt
router.post('/:id/confirm', requireOfficer, async (req, res) => {
  try {
    const dispatchId = req.params.id;
    const { receivedItems, remarks } = req.body;

    const dispatchDoc = await db.collection('dispatches').doc(dispatchId).get();
    if (!dispatchDoc.exists) {
      return res.status(404).json({ success: false, message: 'Dispatch record not found.' });
    }

    const dispatch = dispatchDoc.data();

    // Check office permission: officer must belong to this office (unless admin)
    if (req.user.role === 'officer' && req.user.assignedOfficeId !== dispatch.destinationOfficeId) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Officer is assigned to ${req.user.assignedOfficeId} but this shipment is destined for ${dispatch.destinationOfficeId}.`
      });
    }

    if (dispatch.status === 'DELIVERED') {
      return res.status(400).json({ success: false, message: 'This dispatch has already been confirmed as delivered.' });
    }

    // Inspect discrepancies between dispatched items and received items
    const differences = [];
    let hasMismatch = false;

    const finalReceivedList = [];

    dispatch.items.forEach(dispatchedItem => {
      const match = Array.isArray(receivedItems)
        ? receivedItems.find(r => r.commodity?.toLowerCase() === dispatchedItem.commodity?.toLowerCase())
        : null;

      const receivedQty = match !== undefined && match !== null ? Number(match.receivedQuantity) : Number(dispatchedItem.quantity);
      const diff = receivedQty - Number(dispatchedItem.quantity);

      if (diff !== 0) {
        hasMismatch = true;
        differences.push({
          commodity: dispatchedItem.commodity,
          batchId: dispatchedItem.batchId,
          dispatchedQuantity: Number(dispatchedItem.quantity),
          receivedQuantity: receivedQty,
          difference: diff
        });
      }

      finalReceivedList.push({
        commodity: dispatchedItem.commodity,
        batchId: dispatchedItem.batchId,
        dispatchedQuantity: Number(dispatchedItem.quantity),
        receivedQuantity: receivedQty,
        unit: dispatchedItem.unit
      });
    });

    const newStatus = hasMismatch ? 'MISMATCH_CONFIRMED' : 'DELIVERED';

    // Update Office Inventory with received amounts
    const invDoc = await db.collection('officeInventory').doc(dispatch.destinationOfficeId).get();
    const currentInv = invDoc.exists ? invDoc.data().inventory : { rice: 0, wheat: 0, sugar: 0, dal: 0 };

    finalReceivedList.forEach(item => {
      const key = item.commodity.toLowerCase();
      currentInv[key] = (Number(currentInv[key]) || 0) + item.receivedQuantity;
    });

    await db.collection('officeInventory').doc(dispatch.destinationOfficeId).set({
      officeId: dispatch.destinationOfficeId,
      inventory: currentInv,
      lastUpdated: new Date().toISOString()
    });

    // Update dispatch record
    await db.collection('dispatches').doc(dispatchId).update({
      status: newStatus,
      deliveredAt: new Date().toISOString(),
      confirmedBy: req.user.officerId || req.user.uid,
      receivingOfficerName: req.user.name || 'Officer',
      receivedItems: finalReceivedList,
      discrepancy: hasMismatch,
      differences,
      remarks: remarks || ''
    });

    // Record confirmation to Blockchain
    const blockchainReceipt = await blockchainService.confirmOfficeReceipt({
      dispatchId,
      officeId: dispatch.destinationOfficeId,
      receivedItems: finalReceivedList,
      officerId: req.user.officerId || req.user.uid,
      discrepancy: hasMismatch,
      difference: differences,
      remarks: remarks || (hasMismatch ? 'Quantity mismatch recorded at physical weigh-in.' : 'Stock received and verified.')
    });

    res.json({
      success: true,
      message: hasMismatch
        ? `Shipment confirmed with a QUANTITY MISMATCH! Investigation alert logged on Blockchain ledger.`
        : `Stock delivery confirmed successfully. Office inventory updated and committed to Blockchain.`,
      status: newStatus,
      hasMismatch,
      differences,
      blockchain: blockchainReceipt
    });
  } catch (error) {
    console.error('Error confirming dispatch:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

