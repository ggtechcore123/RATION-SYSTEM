const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../config/firebase');
const { requireAdmin } = require('../middleware/authMiddleware');

// Auto-generate next Officer ID (OFFICER001, OFFICER002, ...)
async function generateNextOfficerId() {
  const officersSnap = await db.collection('officers').get();
  const count = officersSnap.docs.length + 1;
  return `OFFICER${String(count).padStart(3, '0')}`;
}

// Admin list all officers
router.get('/', requireAdmin, async (req, res) => {
  try {
    const snap = await db.collection('officers').get();
    const officers = snap.docs.map(d => {
      const data = d.data();
      const safe = { ...data };
      delete safe.passwordHash;
      return safe;
    });

    res.json({ success: true, count: officers.length, officers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin create officer account
router.post('/', requireAdmin, async (req, res) => {
  try {
    const {
      name,
      username,
      password,
      mobileNumber,
      assignedOfficeId,
      status
    } = req.body;

    if (!name || !username || !password || !assignedOfficeId) {
      return res.status(400).json({
        success: false,
        message: 'Name, Username, Password, and Assigned Office are required.'
      });
    }

    const cleanUsername = username.trim().toLowerCase();

    // Check username uniqueness
    const usersSnap = await db.collection('users').get();
    const exists = usersSnap.docs.some(d => d.data().username?.toLowerCase() === cleanUsername);
    if (exists) {
      return res.status(409).json({ success: false, message: `Username '${cleanUsername}' is already taken.` });
    }

    // Verify assigned office
    const officeDoc = await db.collection('offices').doc(assignedOfficeId).get();
    if (!officeDoc.exists) {
      return res.status(404).json({ success: false, message: `Assigned office ${assignedOfficeId} does not exist.` });
    }
    const officeData = officeDoc.data();

    const officerId = await generateNextOfficerId();
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newOfficer = {
      id: officerId,
      officerId,
      name: name.trim(),
      username: cleanUsername,
      passwordHash,
      mobileNumber: mobileNumber ? mobileNumber.trim() : '',
      assignedOfficeId,
      assignedOfficeName: officeData.officeName,
      officeLocation: `${officeData.district}, ${officeData.state}`,
      role: 'OFFICER',
      status: status || 'ACTIVE',
      createdAt: new Date().toISOString()
    };

    await db.collection('officers').doc(officerId).set(newOfficer);

    // Save auth user
    await db.collection('users').doc(officerId).set({
      uid: officerId,
      username: cleanUsername,
      name: newOfficer.name,
      passwordHash,
      role: 'officer',
      assignedOfficeId,
      createdAt: newOfficer.createdAt
    });

    // Update office with assigned officer
    await db.collection('offices').doc(assignedOfficeId).update({
      assignedOfficerId: officerId,
      assignedOfficerName: newOfficer.name
    });

    const safeOfficer = { ...newOfficer };
    delete safeOfficer.passwordHash;

    res.status(201).json({
      success: true,
      message: `Ration shop officer ${name} created with ID ${officerId}.`,
      officer: safeOfficer
    });
  } catch (error) {
    console.error('Error creating officer:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin reset officer password
router.post('/:id/reset-password', requireAdmin, async (req, res) => {
  try {
    const officerId = req.params.id;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await db.collection('officers').doc(officerId).update({ passwordHash, updatedAt: new Date().toISOString() });
    await db.collection('users').doc(officerId).update({ passwordHash, updatedAt: new Date().toISOString() });

    res.json({ success: true, message: `Password for officer ${officerId} updated successfully.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get officer activity logs
router.get('/:id/activity', requireAdmin, async (req, res) => {
  try {
    const officerId = req.params.id;
    const distSnap = await db.collection('distributions').where('officerId', '==', officerId).get();
    const distributions = distSnap.docs.map(d => d.data());

    res.json({
      success: true,
      officerId,
      totalDistributionsConducted: distributions.length,
      recentActivity: distributions.slice(0, 20)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

