const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { requireAdmin } = require('../middleware/authMiddleware');
const blockchainService = require('../services/blockchainService');

// Auto-generate next Office ID (OFF001, OFF002, ...)
async function generateNextOfficeId() {
  const officesSnap = await db.collection('offices').get();
  const count = officesSnap.docs.length + 1;
  return `OFF${String(count).padStart(3, '0')}`;
}

// Get all offices
router.get('/', async (req, res) => {
  try {
    const officesSnap = await db.collection('offices').get();
    const offices = officesSnap.docs.map(d => d.data());

    // Enrich with current inventory & officer names
    for (const office of offices) {
      office.officeId = office.officeId || office.id;
      const invDoc = await db.collection('officeInventory').doc(office.id).get();
      office.inventory = invDoc.exists ? invDoc.data().inventory : { rice: 0, wheat: 0, sugar: 0, dal: 0 };
    }

    res.json({ success: true, count: offices.length, offices });
  } catch (error) {
    console.error('Error fetching offices:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get office by ID with full details, inventory, assigned officer, recent transactions
router.get('/:id', async (req, res) => {
  try {
    const officeId = req.params.id;
    const officeDoc = await db.collection('offices').doc(officeId).get();
    if (!officeDoc.exists) {
      return res.status(404).json({ success: false, message: 'Office not found.' });
    }

    const office = officeDoc.data();

    // Get inventory
    const invDoc = await db.collection('officeInventory').doc(officeId).get();
    office.inventory = invDoc.exists ? invDoc.data().inventory : { rice: 0, wheat: 0, sugar: 0, dal: 0 };

    // Get assigned officer details
    if (office.assignedOfficerId) {
      const officerDoc = await db.collection('officers').doc(office.assignedOfficerId).get();
      office.assignedOfficer = officerDoc.exists ? officerDoc.data() : null;
    }

    // Get blockchain transactions for this office
    const txs = blockchainService.getTransactionHistory(20, { officeId });
    office.recentTransactions = txs;

    // Get recent distributions
    const distSnap = await db.collection('distributions').where('officeId', '==', officeId).limit(10).get();
    office.recentDistributions = distSnap.docs.map(d => d.data());

    res.json({ success: true, office });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin create office
router.post('/', requireAdmin, async (req, res) => {
  try {
    const {
      officeName,
      state,
      district,
      taluk,
      village,
      pincode,
      address,
      contactNumber,
      assignedOfficerId,
      status
    } = req.body;

    if (!officeName || !state || !district) {
      return res.status(400).json({ success: false, message: 'Office Name, State, and District are required.' });
    }

    const officeId = await generateNextOfficeId();

    let officerName = null;
    if (assignedOfficerId) {
      const offrDoc = await db.collection('officers').doc(assignedOfficerId).get();
      if (offrDoc.exists) {
        officerName = offrDoc.data().name;
        // Also update officer's assigned office
        await db.collection('officers').doc(assignedOfficerId).update({
          assignedOfficeId: officeId,
          assignedOfficeName: officeName
        });
      }
    }

    const newOffice = {
      id: officeId,
      officeId,
      officeName: officeName.trim(),
      state: state.trim(),
      district: district.trim(),
      taluk: taluk ? taluk.trim() : '',
      village: village ? village.trim() : '',
      pincode: pincode ? pincode.trim() : '',
      address: address ? address.trim() : '',
      contactNumber: contactNumber ? contactNumber.trim() : '',
      assignedOfficerId: assignedOfficerId || null,
      assignedOfficerName: officerName,
      status: status || 'ACTIVE',
      totalRegisteredBeneficiaries: 0,
      createdAt: new Date().toISOString()
    };

    await db.collection('offices').doc(officeId).set(newOffice);

    // Initialize blank inventory
    await db.collection('officeInventory').doc(officeId).set({
      officeId,
      inventory: { rice: 0, wheat: 0, sugar: 0, dal: 0 },
      lastUpdated: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      message: `Ration Office ${officeName} created with ID ${officeId}.`,
      office: newOffice
    });
  } catch (error) {
    console.error('Error creating office:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin edit office
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const officeId = req.params.id;
    const doc = await db.collection('offices').doc(officeId).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Office not found.' });
    }

    const updates = { ...req.body };
    delete updates.id;
    delete updates.officeId;

    if (updates.assignedOfficerId) {
      const offrDoc = await db.collection('officers').doc(updates.assignedOfficerId).get();
      if (offrDoc.exists) {
        updates.assignedOfficerName = offrDoc.data().name;
        await db.collection('officers').doc(updates.assignedOfficerId).update({
          assignedOfficeId: officeId,
          assignedOfficeName: updates.officeName || doc.data().officeName
        });
      }
    }

    await db.collection('offices').doc(officeId).update(updates);

    res.json({
      success: true,
      message: `Office ${officeId} updated successfully.`,
      office: { ...doc.data(), ...updates }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin toggle office status (ACTIVE / INACTIVE)
router.patch('/:id/status', requireAdmin, async (req, res) => {
  try {
    const officeId = req.params.id;
    const { status } = req.body;
    await db.collection('offices').doc(officeId).update({
      status: status || 'ACTIVE',
      updatedAt: new Date().toISOString()
    });
    res.json({ success: true, message: `Office ${officeId} status changed to ${status}.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

