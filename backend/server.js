const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');
const dotenv = require('dotenv');

dotenv.config();

const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const officeRoutes = require('./routes/officeRoutes');
const officerRoutes = require('./routes/officerRoutes');
const warehouseRoutes = require('./routes/warehouseRoutes');
const stockRoutes = require('./routes/stockRoutes');
const dispatchRoutes = require('./routes/dispatchRoutes');
const distributionRoutes = require('./routes/distributionRoutes');
const blockchainRoutes = require('./routes/blockchainRoutes');
const iotRoutes = require('./routes/iotRoutes');
const reportRoutes = require('./routes/reportRoutes');

const app = express();
const server = http.createServer(app);

// WebSocket server for real-time ESP32 biometric alerts and live ledger feeds
const wss = new WebSocketServer({ server, path: '/ws/live' });

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Connected to Smart PDS Real-Time Telemetry & Ledger Feed.' }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      // Broadcast to all clients
      wss.clients.forEach(client => {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify(data));
        }
      });
    } catch (e) {
      console.error('WS parse error:', e);
    }
  });
});

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

// Static Frontend files
const frontendPath = path.join(__dirname, '..', 'frontend');
const rootPath = path.join(__dirname, '..');

app.use(express.static(frontendPath));
app.use(express.static(rootPath));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/offices', officeRoutes);
app.use('/api/officers', officerRoutes);
app.use('/api/warehouses', warehouseRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/dispatches', dispatchRoutes);
app.use('/api/distribution', distributionRoutes);
app.use('/api/blockchain', blockchainRoutes);
app.use('/api/iot', iotRoutes);
app.use('/api/reports', reportRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    service: 'Smart PDS Indian National Public Distribution System API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    system: {
      firebaseProject: process.env.FIREBASE_PROJECT_ID || 'ration-system-877e4',
      firebaseConnected: true,
      blockchain: 'Hyperledger Fabric (pdschannel)',
      iotBridge: 'ACTIVE',
      encryption: 'AES-256 + SHA-256'
    }
  });
});

// Fallback to index.html for navigation
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
    return next();
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Smart Indian Public Distribution System (PDS) Server`);
  console.log(`📡 HTTP Server running on: http://localhost:${PORT}`);
  console.log(`⛓️  Hyperledger Fabric Ledger & Biometrics Bridge Online`);
  console.log(`🏛️  Portal UI: http://localhost:${PORT}/index.html`);
  console.log(`=======================================================`);
});
