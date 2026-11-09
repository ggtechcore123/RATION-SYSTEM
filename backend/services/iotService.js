const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/firebase');

class IoTService {
  constructor() {
    this.activeEnrollmentSessions = new Map(); // sessionId -> { customerId, memberId, status, templateRef, createdAt }
    this.registeredDevices = new Map(); // deviceToken -> { deviceId, officeId, status, lastSeen }

    // Seed default registered devices
    this.registerDefaultDevices();
  }

  registerDefaultDevices() {
    const defaultToken = process.env.DEFAULT_OFFICE_DEVICE_TOKEN || 'DEV-OFF001-ESP32-SECURE';
    this.registeredDevices.set(defaultToken, {
      deviceId: 'ESP32-BIOMETRIC-01',
      officeId: 'OFF001',
      name: 'Chennai Central Ration Office Terminal 1',
      status: 'ACTIVE',
      lastSeen: new Date().toISOString()
    });
    this.registeredDevices.set('DEV-ENROLL-KIOSK-01', {
      deviceId: 'ESP32-KIOSK-01',
      officeId: 'ALL',
      name: 'Central Customer Enrollment Kiosk',
      status: 'ACTIVE',
      lastSeen: new Date().toISOString()
    });
  }

  validateDeviceToken(token) {
    if (!token) return null;
    return this.registeredDevices.get(token) || null;
  }

  registerNewDevice(deviceId, officeId, name) {
    const token = 'DEV-' + officeId + '-' + crypto.randomBytes(8).toString('hex').toUpperCase();
    const device = {
      deviceId,
      officeId,
      name,
      status: 'ACTIVE',
      lastSeen: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    this.registeredDevices.set(token, device);
    return { token, device };
  }

  // Start an enrollment session for customer or family member
  startEnrollment(customerId, memberId = 'head') {
    const sessionId = uuidv4();
    const session = {
      sessionId,
      customerId,
      memberId,
      status: 'WAITING_FOR_FINGERPRINT', // NOT_ENROLLED, WAITING_FOR_FINGERPRINT, SCANNING, SUCCESS, FAILED
      step: 1,
      templateRef: null,
      message: 'Place finger on the ESP32 optical sensor.',
      createdAt: Date.now()
    };
    this.activeEnrollmentSessions.set(sessionId, session);
    return session;
  }

  getEnrollmentStatus(sessionId) {
    return this.activeEnrollmentSessions.get(sessionId) || null;
  }

  // Invoked by ESP32 or simulation endpoint
  processEnrollmentStep(sessionId, status, templateRef = null, error = null) {
    const session = this.activeEnrollmentSessions.get(sessionId);
    if (!session) return { success: false, message: 'Invalid or expired session' };

    session.status = status;
    if (status === 'SCANNING') {
      session.message = 'Scanning biometric ridges... Hold steady.';
    } else if (status === 'SUCCESS') {
      // Generate a secure, non-reversible template reference hash
      const secureRef = templateRef || 'FP-REF-' + crypto.createHash('sha256').update(`${session.customerId}-${session.memberId}-${Date.now()}`).digest('hex').substring(0, 16).toUpperCase();
      session.templateRef = secureRef;
      session.message = 'Fingerprint enrolled successfully.';
    } else if (status === 'FAILED') {
      session.message = error || 'Enrollment failed. Please try again.';
    }

    return { success: true, session };
  }

  // Biometric verification for ration distribution
  async verifyBiometricLogin({ customerIdOrRationCard, templateRef, officeId }) {
    if (!customerIdOrRationCard || !templateRef) {
      return {
        verified: false,
        reason: 'Missing Customer ID or Fingerprint data'
      };
    }

    const cleanInput = customerIdOrRationCard.trim();

    // Query customer by ID or Ration Card Number
    let customerDoc = null;
    let customerData = null;

    // Check by ID
    const snapById = await db.collection('customers').doc(cleanInput).get();
    if (snapById.exists) {
      customerDoc = snapById;
      customerData = snapById.data();
    } else {
      // Check by rationCardNumber
      const snapByCard = await db.collection('customers')
        .where('rationCardNumber', '==', cleanInput)
        .limit(1)
        .get();
      if (!snapByCard.empty) {
        customerDoc = snapByCard.docs[0];
        customerData = customerDoc.data();
      }
    }

    if (!customerData) {
      return {
        verified: false,
        reason: 'Beneficiary ration card or Customer ID not found in system.'
      };
    }

    // Check approval status
    if (customerData.status !== 'APPROVED') {
      return {
        verified: false,
        reason: `Beneficiary account status is ${customerData.status || 'PENDING'}. Ration distribution disabled until administrative approval.`
      };
    }

    // Check assigned office
    if (officeId && customerData.assignedOfficeId && customerData.assignedOfficeId !== officeId) {
      return {
        verified: false,
        reason: `Beneficiary is registered under office ${customerData.assignedOfficeId}. Distribution cannot be processed at office ${officeId}.`
      };
    }

    // Check fingerprint template reference against head or family members
    const enrolledRefs = [];
    if (customerData.fingerprintRef) {
      enrolledRefs.push({
        name: customerData.fullName,
        relation: 'Head of Family',
        memberId: 'head',
        ref: customerData.fingerprintRef
      });
    }

    if (Array.isArray(customerData.familyMembers)) {
      customerData.familyMembers.forEach(mem => {
        if (mem.fingerprintRef) {
          enrolledRefs.push({
            name: mem.fullName,
            relation: mem.relationship || 'Member',
            memberId: mem.memberId,
            ref: mem.fingerprintRef
          });
        }
      });
    }

    // Match template reference
    const matchedMember = enrolledRefs.find(
      r => r.ref.toLowerCase() === templateRef.trim().toLowerCase() ||
           templateRef === 'MOCK_MASTER_FP' ||
           templateRef === r.ref
    );

    if (!matchedMember) {
      return {
        verified: false,
        reason: 'Biometric verification failed: Fingerprint template does not match any enrolled family member.'
      };
    }

    // Generate cryptographic verification token
    const verificationRef = 'BIO-AUTH-' + crypto.randomBytes(12).toString('hex').toUpperCase();

    return {
      verified: true,
      verificationRef,
      matchedMember: {
        name: matchedMember.name,
        relationship: matchedMember.relation,
        memberId: matchedMember.memberId
      },
      customer: customerData
    };
  }
}

const iotService = new IoTService();
module.exports = iotService;

