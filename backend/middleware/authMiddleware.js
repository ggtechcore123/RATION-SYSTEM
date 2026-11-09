const jwt = require('jsonwebtoken');
const iotService = require('../services/iotService');

const JWT_SECRET = process.env.JWT_SECRET || 'smart_pds_super_secure_jwt_secret_2025_blockchain_key';

// Generate JWT token
function generateToken(payload, expiresIn = '12h') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

// Authenticate any logged-in user (admin, officer, or customer)
function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Missing or invalid Authorization header.'
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired session token.'
    });
  }
}

// Require Admin Role
function requireAdmin(req, res, next) {
  authenticateUser(req, res, () => {
    if (req.user && req.user.role === 'admin') {
      next();
    } else {
      res.status(403).json({
        success: false,
        message: 'Forbidden. Administrative privileges required.'
      });
    }
  });
}

// Require Officer Role
function requireOfficer(req, res, next) {
  authenticateUser(req, res, () => {
    if (req.user && (req.user.role === 'officer' || req.user.role === 'admin')) {
      next();
    } else {
      res.status(403).json({
        success: false,
        message: 'Forbidden. Ration shop officer privileges required.'
      });
    }
  });
}

// Require Officer for Specific Assigned Office
function requireOfficeAccess(req, res, next) {
  authenticateUser(req, res, () => {
    if (req.user.role === 'admin') {
      return next(); // Admins can manage any office
    }

    if (req.user.role === 'officer') {
      const requestedOfficeId = req.params.officeId || req.body.officeId || req.query.officeId;
      if (!requestedOfficeId || req.user.assignedOfficeId === requestedOfficeId) {
        return next();
      }
      return res.status(403).json({
        success: false,
        message: `Forbidden: Officer is assigned to office ${req.user.assignedOfficeId} and cannot access or modify office ${requestedOfficeId}.`
      });
    }

    res.status(403).json({
      success: false,
      message: 'Unauthorized access to office operations.'
    });
  });
}

// Authenticate ESP32 / IoT Hardware via Device Token
function authenticateIoTDevice(req, res, next) {
  const deviceToken = req.headers['x-device-token'] || req.query.deviceToken;
  if (!deviceToken) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized IoT Device. Missing X-Device-Token header.'
    });
  }

  const device = iotService.validateDeviceToken(deviceToken);
  if (!device) {
    return res.status(403).json({
      success: false,
      message: 'Unrecognized or inactive IoT Device Token.'
    });
  }

  req.device = device;
  next();
}

module.exports = {
  generateToken,
  authenticateUser,
  requireAdmin,
  requireOfficer,
  requireOfficeAccess,
  authenticateIoTDevice
};

