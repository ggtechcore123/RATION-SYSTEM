const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../config/firebase');
const { requireAdmin } = require('../middleware/authMiddleware');
const blockchainService = require('../services/blockchainService');

// Multer upload config
const uploadDir = path.join(__dirname, '..', '..', 'frontend', 'assets', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `DOC-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Document upload endpoint
router.post('/upload-doc', upload.single('document'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded.' });
  }
  const relativePath = `/assets/uploads/${req.file.filename}`;
  res.json({
    success: true,
    filePath: relativePath,
    originalName: req.file.originalname,
    size: req.file.size
  });
});

// Helper to generate unique Customer ID
async function generateUniqueCustomerId(stateCode = 'TN') {
  const currentYear = new Date().getFullYear();
  const snap = await db.collection('customers').get();
  const count = snap.docs.length + 1;
  const seq = String(count).padStart(4, '0');
  return `CUST-${stateCode}-${currentYear}-${seq}`;
}

// Register new customer (multi-step submission)
router.post('/register', async (req, res) => {
  try {
    const {
      fullName,
      dateOfBirth,
      gender,
      mobileNumber,
      email,
      address,
      state,
      district,
      taluk,
      village,
      pincode,
      rationCardNumber,
      rationCardCategory,
      familyHeadName,
      numberOfFamilyMembers,
      assignedOfficeId,
      existingRationShop,
      familyMembers,
      fingerprintRef,
      documents
    } = req.body;

    if (!fullName || !mobileNumber || !rationCardNumber || !rationCardCategory || !assignedOfficeId) {
      return res.status(400).json({
        success: false,
        message: 'Required fields missing (Full Name, Mobile, Ration Card Number, Category, Assigned Office).'
      });
    }

    // Check if ration card is already registered
    const existingCardSnap = await db.collection('customers')
      .where('rationCardNumber', '==', rationCardNumber.trim())
      .get();

    if (!existingCardSnap.empty) {
      return res.status(409).json({
        success: false,
        message: `Ration Card Number ${rationCardNumber} is already registered in the National PDS Registry.`
      });
    }

    // Look up assigned office
    const officeDoc = await db.collection('offices').doc(assignedOfficeId).get();
    const officeData = officeDoc.exists ? officeDoc.data() : null;

    const customerId = await generateUniqueCustomerId(state ? state.substring(0, 2).toUpperCase() : 'TN');

    const customerRecord = {
      id: customerId,
      customerId,
      fullName: fullName.trim(),
      dateOfBirth: dateOfBirth || '',
      gender: gender || 'Other',
      mobileNumber: mobileNumber.trim(),
      email: email ? email.trim() : '',
      address: address || '',
      state: state || 'Tamil Nadu',
      district: district || 'Chennai',
      taluk: taluk || '',
      village: village || '',
      pincode: pincode || '',
      rationCardNumber: rationCardNumber.trim().toUpperCase(),
      rationCardCategory: (rationCardCategory || 'PHH').toUpperCase(),
      familyHeadName: familyHeadName || fullName,
      numberOfFamilyMembers: Number(numberOfFamilyMembers) || (Array.isArray(familyMembers) ? familyMembers.length : 0),
      assignedOfficeId,
      assignedOfficeName: officeData ? officeData.officeName : assignedOfficeId,
      existingRationShop: existingRationShop || '',
      familyMembers: Array.isArray(familyMembers) ? familyMembers : [],
      fingerprintRef: fingerprintRef || `FP-REF-${Date.now().toString().slice(-6)}`,
      fingerprintStatus: fingerprintRef ? 'ENROLLED' : 'NOT_ENROLLED',
      documents: documents || {},
      status: 'PENDING', // Customer starts in PENDING status until Admin review
      createdAt: new Date().toISOString()
    };

    await db.collection('customers').doc(customerId).set(customerRecord);

    // Save login user entry
    await db.collection('users').doc(customerId).set({
      uid: customerId,
      username: customerId,
      name: customerRecord.fullName,
      rationCardNumber: customerRecord.rationCardNumber,
      role: 'customer',
      status: 'PENDING',
      assignedOfficeId,
      createdAt: customerRecord.createdAt
    });

    res.status(201).json({
      success: true,
      message: 'Ration card application submitted successfully. Application is pending administrative verification.',
      customerId,
      customer: customerRecord
    });
  } catch (error) {
    console.error('Customer registration error:', error);
    res.status(500).json({ success: false, message: 'Server error during customer registration: ' + error.message });
  }
});

// Admin list customers with filters & pagination
router.get('/', async (req, res) => {
  try {
    const { status, search, officeId } = req.query;
    let docs = (await db.collection('customers').get()).docs.map(d => d.data());

    if (status) {
      docs = docs.filter(c => c.status === status.toUpperCase());
    }
    if (officeId) {
      docs = docs.filter(c => c.assignedOfficeId === officeId);
    }
    if (search) {
      const q = search.toLowerCase();
      docs = docs.filter(c =>
        (c.fullName && c.fullName.toLowerCase().includes(q)) ||
        (c.customerId && c.customerId.toLowerCase().includes(q)) ||
        (c.rationCardNumber && c.rationCardNumber.toLowerCase().includes(q)) ||
        (c.mobileNumber && c.mobileNumber.includes(q))
      );
    }

    // Sort by creation date desc
    docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      success: true,
      count: docs.length,
      customers: docs
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ success: false, message: 'Error fetching customers.' });
  }
});

// Get customer by ID
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection('customers').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Beneficiary not found.' });
    }
    res.json({ success: true, customer: doc.data() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Track application status
router.get('/track/:identifier', async (req, res) => {
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
      return res.status(404).json({ success: false, message: 'No application found with provided ID or Ration Card Number.' });
    }

    res.json({
      success: true,
      customerId: customer.customerId,
      fullName: customer.fullName,
      rationCardNumber: customer.rationCardNumber,
      category: customer.rationCardCategory,
      assignedOfficeName: customer.assignedOfficeName,
      status: customer.status,
      rejectionReason: customer.rejectionReason || null,
      createdAt: customer.createdAt,
      approvedAt: customer.approvedAt || null
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin Approve Customer
router.post('/:id/approve', requireAdmin, async (req, res) => {
  try {
    const customerId = req.params.id;
    const doc = await db.collection('customers').doc(customerId).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    const customer = doc.data();
    const approvedAt = new Date().toISOString();

    await db.collection('customers').doc(customerId).update({
      status: 'APPROVED',
      approvedAt,
      approvedBy: req.user.uid || 'admin_master',
      rejectionReason: null
    });

    // Update login status
    await db.collection('users').doc(customerId).update({ status: 'APPROVED' });

    // Update office beneficiary counter
    if (customer.assignedOfficeId) {
      const officeDoc = await db.collection('offices').doc(customer.assignedOfficeId).get();
      if (officeDoc.exists) {
        const offData = officeDoc.data();
        await db.collection('offices').doc(customer.assignedOfficeId).update({
          totalRegisteredBeneficiaries: (offData.totalRegisteredBeneficiaries || 0) + 1
        });
      }
    }

    res.json({
      success: true,
      message: `Beneficiary ${customer.fullName} (${customerId}) successfully approved for ration distribution.`,
      status: 'APPROVED'
    });
  } catch (error) {
    console.error('Approve customer error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin Reject Customer
router.post('/:id/reject', requireAdmin, async (req, res) => {
  try {
    const customerId = req.params.id;
    const { reason } = req.body;
    const doc = await db.collection('customers').doc(customerId).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    await db.collection('customers').doc(customerId).update({
      status: 'REJECTED',
      rejectionReason: reason || 'Documents could not be verified according to PDS guidelines.',
      rejectedAt: new Date().toISOString(),
      rejectedBy: req.user.uid || 'admin_master'
    });

    await db.collection('users').doc(customerId).update({ status: 'REJECTED' });

    res.json({
      success: true,
      message: `Beneficiary application marked as REJECTED.`,
      status: 'REJECTED'
    });
  } catch (error) {
    console.error('Reject customer error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

