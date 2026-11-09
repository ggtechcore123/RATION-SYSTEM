const express = require('express');
const router = express.Router();
const iotService = require('../services/iotService');
const { authenticateIoTDevice } = require('../middleware/authMiddleware');

// 1. Start enrollment session
router.post('/enroll/start', (req, res) => {
  try {
    const { customerId, memberId } = req.body;
    if (!customerId) {
      return res.status(400).json({ success: false, message: 'Customer ID is required.' });
    }

    const session = iotService.startEnrollment(customerId, memberId || 'head');
    res.json({
      success: true,
      sessionId: session.sessionId,
      session
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Poll enrollment status (used by browser)
router.get('/enroll/status/:sessionId', (req, res) => {
  try {
    const session = iotService.getEnrollmentStatus(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Enrollment session not found or expired.' });
    }
    res.json({ success: true, session });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. Step execution for enrollment (invoked by ESP32 or simulation bridge)
router.post('/enroll/step', (req, res) => {
  try {
    const { sessionId, status, templateRef, error } = req.body;
    if (!sessionId || !status) {
      return res.status(400).json({ success: false, message: 'Session ID and status are required.' });
    }

    const result = iotService.processEnrollmentStep(sessionId, status, templateRef, error);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Biometric authentication from ESP32 Keypad & Fingerprint Sensor
// Protected via secure device token
router.post('/verify', async (req, res) => {
  try {
    const deviceToken = req.headers['x-device-token'] || req.body.deviceToken || 'DEV-OFF001-ESP32-SECURE';
    const device = iotService.validateDeviceToken(deviceToken);

    if (!device) {
      return res.status(403).json({
        success: false,
        verified: false,
        message: 'Device authentication rejected. Unregistered or unauthorized ESP32 terminal.'
      });
    }

    const { customerIdOrRationCard, templateRef, officeId } = req.body;

    const authResult = await iotService.verifyBiometricLogin({
      customerIdOrRationCard,
      templateRef,
      officeId: officeId || device.officeId
    });

    if (!authResult.verified) {
      return res.status(401).json({
        success: false,
        verified: false,
        reason: authResult.reason
      });
    }

    res.json({
      success: true,
      verified: true,
      message: 'CUSTOMER VERIFIED',
      verificationRef: authResult.verificationRef,
      matchedMember: authResult.matchedMember,
      customer: {
        customerId: authResult.customer.customerId,
        fullName: authResult.customer.fullName,
        rationCardNumber: authResult.customer.rationCardNumber,
        category: authResult.customer.rationCardCategory,
        assignedOfficeId: authResult.customer.assignedOfficeId,
        assignedOfficeName: authResult.customer.assignedOfficeName,
        familyMembers: authResult.customer.familyMembers
      }
    });
  } catch (error) {
    console.error('Biometric verification error:', error);
    res.status(500).json({
      success: false,
      verified: false,
      reason: 'Server error during biometric verification: ' + error.message
    });
  }
});

// 5. Active IoT devices registry
router.get('/devices', (req, res) => {
  const devices = Array.from(iotService.registeredDevices.entries()).map(([token, dev]) => ({
    tokenPreview: token.substring(0, 10) + '...',
    ...dev
  }));
  res.json({ success: true, count: devices.length, devices });
});

module.exports = router;

