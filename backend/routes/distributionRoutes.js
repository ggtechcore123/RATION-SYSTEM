const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { requireOfficer } = require('../middleware/authMiddleware');
const { entitlementService } = require('../services/entitlementService');
const blockchainService = require('../services/blockchainService');

// Generate Distribution & Receipt ID
async function generateDistributionId() {
  const currentYear = new Date().getFullYear();
  const snap = await db.collection('distributions').get();
  const count = snap.docs.length + 1;
  return `DIST-${currentYear}-${String(count).padStart(4, '0')}`;
}

// 1. Get beneficiary entitlement calculation
router.get('/entitlement/:identifier', async (req, res) => {
  try {
    const identifier = req.params.identifier.trim();
    let customer = null;

    const byId = await db.collection('customers').doc(identifier).get();
    if (byId.exists) {
      customer = byId.data();
    } else {
      const byCard = await db.collection('customers').where('rationCardNumber', '==', identifier.toUpperCase()).limit(1).get();
      if (!byCard.empty) {
        customer = byCard.docs[0].data();
      }
    }

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Beneficiary not found.' });
    }

    if (customer.status !== 'APPROVED') {
      return res.status(403).json({
        success: false,
        message: `Beneficiary account status is ${customer.status || 'PENDING'}. Ration distribution is only permitted for APPROVED beneficiaries.`
      });
    }

    const summary = await entitlementService.getBeneficiaryEntitlementSummary(customer);

    res.json({
      success: true,
      entitlement: summary,
      customer
    });
  } catch (error) {
    console.error('Error calculating entitlement:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Perform ration distribution
router.post('/distribute', requireOfficer, async (req, res) => {
  try {
    const {
      customerId,
      officeId,
      items, // Array of { commodity, quantity }
      biometricVerificationRef,
      authenticatedMemberName
    } = req.body;

    if (!customerId || !officeId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID, Office ID, and distributed items are required.'
      });
    }

    // Role check: officer must only distribute at their assigned office
    if (req.user.role === 'officer' && req.user.assignedOfficeId !== officeId) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Officer is assigned to office ${req.user.assignedOfficeId} and cannot distribute ration for office ${officeId}.`
      });
    }

    // 1. Verify customer and status
    const customerDoc = await db.collection('customers').doc(customerId).get();
    if (!customerDoc.exists) {
      return res.status(404).json({ success: false, message: 'Beneficiary not found.' });
    }
    const customer = customerDoc.data();

    if (customer.status !== 'APPROVED') {
      return res.status(400).json({
        success: false,
        message: 'Cannot distribute ration. Beneficiary application is not yet approved.'
      });
    }

    // Verify office match
    if (customer.assignedOfficeId && customer.assignedOfficeId !== officeId) {
      return res.status(400).json({
        success: false,
        message: `Beneficiary is assigned to office ${customer.assignedOfficeId}, not ${officeId}.`
      });
    }

    // 2. Check beneficiary monthly entitlement limits
    const entitlementSummary = await entitlementService.getBeneficiaryEntitlementSummary(customer);
    const entitlementMap = {};
    entitlementSummary.items.forEach(i => {
      entitlementMap[i.commodity.toLowerCase()] = i;
    });

    let totalAmount = 0;
    const finalItems = [];

    for (const item of items) {
      const commKey = item.commodity.toLowerCase();
      const requestedQty = Number(item.quantity || 0);

      if (requestedQty <= 0) continue; // Skip 0 or negative items

      const quota = entitlementMap[commKey];
      if (!quota) {
        return res.status(400).json({
          success: false,
          message: `Commodity ${item.commodity} is not in the approved entitlement schedule.`
        });
      }

      if (requestedQty > quota.remaining) {
        return res.status(400).json({
          success: false,
          message: `Excess distribution prevented! Requested ${requestedQty} KG of ${quota.name}, but remaining entitlement for this month is only ${quota.remaining} KG.`
        });
      }

      const itemCost = requestedQty * (quota.pricePerUnit || 0);
      totalAmount += itemCost;

      finalItems.push({
        commodity: quota.name,
        code: commKey,
        quantity: requestedQty,
        unit: quota.unit,
        pricePerUnit: quota.pricePerUnit,
        amount: itemCost
      });
    }

    if (finalItems.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid quantities entered for distribution.' });
    }

    // 3. Check and deduct Office Inventory atomically
    const officeInvDoc = await db.collection('officeInventory').doc(officeId).get();
    const officeInv = officeInvDoc.exists ? officeInvDoc.data().inventory : { rice: 0, wheat: 0, sugar: 0, dal: 0 };

    for (const item of finalItems) {
      const availOffice = Number(officeInv[item.code] || 0);
      if (item.quantity > availOffice) {
        return res.status(400).json({
          success: false,
          message: `Insufficient office stock for ${item.commodity}! Available in shop: ${availOffice} KG, Requested: ${item.quantity} KG.`
        });
      }
    }

    // Deduct stock
    for (const item of finalItems) {
      officeInv[item.code] = Number(officeInv[item.code]) - item.quantity;
    }

    await db.collection('officeInventory').doc(officeId).update({
      inventory: officeInv,
      lastUpdated: new Date().toISOString()
    });

    // 4. Record Distribution & Generate Receipt
    const distributionId = await generateDistributionId();
    const receiptNumber = 'RCP-' + distributionId.replace('DIST-', '');
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const distributionRecord = {
      id: distributionId,
      distributionId,
      receiptNumber,
      customerId,
      rationCardNumber: customer.rationCardNumber,
      category: customer.rationCardCategory,
      beneficiaryName: customer.fullName,
      monthKey,
      officeId,
      officerId: req.user.officerId || req.user.uid,
      officerName: req.user.name || 'Officer',
      biometricVerificationRef: biometricVerificationRef || 'BIO-AUTH-VERIFIED',
      authenticatedMember: authenticatedMemberName || customer.fullName + ' (Head)',
      items: finalItems,
      totalAmountPaid: totalAmount,
      timestamp: new Date().toISOString()
    };

    await db.collection('distributions').doc(distributionId).set(distributionRecord);

    // 5. Commit to Hyperledger Fabric Blockchain Smart Contract
    const blockchainReceipt = await blockchainService.distributeRation({
      distributionId,
      customerId,
      rationCardNumber: customer.rationCardNumber,
      officeId,
      officerId: req.user.officerId || req.user.uid,
      distributedItems: finalItems,
      biometricVerificationRef: distributionRecord.biometricVerificationRef,
      receiptNumber
    });

    // Attach blockchain receipt info
    distributionRecord.blockchain = blockchainReceipt;

    res.status(201).json({
      success: true,
      message: 'Ration distribution confirmed. Office stock updated and transaction recorded on Blockchain.',
      distribution: distributionRecord,
      receiptNumber,
      blockchain: blockchainReceipt
    });
  } catch (error) {
    console.error('Distribution error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. Distribution history (by office or customer)
router.get('/history', async (req, res) => {
  try {
    const { officeId, customerId, limit = 50 } = req.query;
    let docs = (await db.collection('distributions').get()).docs.map(d => d.data());

    if (officeId) {
      docs = docs.filter(d => d.officeId === officeId);
    }
    if (customerId) {
      docs = docs.filter(d => d.customerId === customerId);
    }

    docs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    docs = docs.slice(0, Number(limit));

    res.json({ success: true, count: docs.length, distributions: docs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Receipt details
router.get('/receipt/:receiptId', async (req, res) => {
  try {
    const receiptId = req.params.receiptId.trim();
    const snap = await db.collection('distributions').where('receiptNumber', '==', receiptId).limit(1).get();
    if (snap.empty) {
      return res.status(404).json({ success: false, message: 'Receipt not found.' });
    }

    const dist = snap.docs[0].data();
    res.json({ success: true, receipt: dist });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

