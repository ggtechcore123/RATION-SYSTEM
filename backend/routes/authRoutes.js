const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../config/firebase');
const { generateToken, authenticateUser } = require('../middleware/authMiddleware');

// Admin Login
router.post('/admin-login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    const cleanUsername = username.trim().toLowerCase();

    // Query user
    const usersSnap = await db.collection('users').get();
    const adminUser = usersSnap.docs
      .map(d => d.data())
      .find(u => (u.username?.toLowerCase() === cleanUsername || u.email?.toLowerCase() === cleanUsername) && u.role === 'admin');

    if (!adminUser) {
      return res.status(401).json({ success: false, message: 'Invalid administrative credentials.' });
    }

    const isMatch = await bcrypt.compare(password, adminUser.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid administrative credentials.' });
    }

    const token = generateToken({
      uid: adminUser.uid,
      username: adminUser.username,
      role: 'admin',
      name: adminUser.name
    });

    res.json({
      success: true,
      token,
      user: {
        uid: adminUser.uid,
        username: adminUser.username,
        role: 'admin',
        name: adminUser.name
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'Server error during admin login.' });
  }
});

// Officer Login
router.post('/officer-login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Officer ID / Username and password are required.' });
    }

    const cleanInput = username.trim().toLowerCase();

    const officersSnap = await db.collection('officers').get();
    const officer = officersSnap.docs
      .map(d => d.data())
      .find(o => o.username?.toLowerCase() === cleanInput || o.officerId?.toLowerCase() === cleanInput);

    if (!officer) {
      return res.status(401).json({ success: false, message: 'Officer account not found.' });
    }

    if (officer.status !== 'ACTIVE') {
      return res.status(403).json({ success: false, message: 'This officer account is inactive or suspended.' });
    }

    const isMatch = await bcrypt.compare(password, officer.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid officer credentials.' });
    }

    // Retrieve assigned office details
    const officeDoc = await db.collection('offices').doc(officer.assignedOfficeId).get();
    const officeData = officeDoc.exists ? officeDoc.data() : null;

    const token = generateToken({
      uid: officer.id,
      officerId: officer.officerId,
      name: officer.name,
      username: officer.username,
      role: 'officer',
      assignedOfficeId: officer.assignedOfficeId
    });

    res.json({
      success: true,
      token,
      officer: {
        officerId: officer.officerId,
        name: officer.name,
        username: officer.username,
        role: 'officer',
        assignedOfficeId: officer.assignedOfficeId,
        assignedOffice: officeData
      }
    });
  } catch (error) {
    console.error('Officer login error:', error);
    res.status(500).json({ success: false, message: 'Server error during officer login.' });
  }
});

// Customer Login / Portal Access
router.post('/customer-login', async (req, res) => {
  try {
    const { identifier } = req.body; // Customer ID or Ration Card Number
    if (!identifier) {
      return res.status(400).json({ success: false, message: 'Customer ID or Ration Card Number is required.' });
    }

    const cleanInput = identifier.trim();

    let customer = null;
    const byId = await db.collection('customers').doc(cleanInput).get();
    if (byId.exists) {
      customer = byId.data();
    } else {
      const byCard = await db.collection('customers').where('rationCardNumber', '==', cleanInput).limit(1).get();
      if (!byCard.empty) {
        customer = byCard.docs[0].data();
      }
    }

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer record not found for provided identification.' });
    }

    const token = generateToken({
      uid: customer.customerId || customer.id,
      role: 'customer',
      customerId: customer.customerId,
      rationCardNumber: customer.rationCardNumber
    });

    res.json({
      success: true,
      token,
      customer
    });
  } catch (error) {
    console.error('Customer login error:', error);
    res.status(500).json({ success: false, message: 'Server error during customer lookup.' });
  }
});

// Current User Info
router.get('/me', authenticateUser, async (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

module.exports = router;

