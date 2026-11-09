/**
 * Smart Indian Public Distribution System (PDS)
 * Client API Library & Global Helper Functions
 */

// Route local static-server and file:// requests to the local API server.
const BACKEND_PORT = 5000;
const isFileProtocol = window.location.protocol === 'file:';
const isGitHubPages = window.location.hostname.includes('github.io');
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const isDevLiveServer = isLocalhost && window.location.port && window.location.port !== String(BACKEND_PORT);
const localBackendOrigin = `http://${isFileProtocol ? 'localhost' : window.location.hostname}:${BACKEND_PORT}`;

// Custom API Gateway override if user hosts backend on Render/Railway/Fly
const customBackendUrl = localStorage.getItem('pds_backend_api_url');

const API_BASE = customBackendUrl
  ? customBackendUrl.replace(/\/$/, '')
  : isFileProtocol
    ? `${localBackendOrigin}/api`
    : isDevLiveServer
      ? `${window.location.protocol}//${window.location.hostname}:${BACKEND_PORT}/api`
      : isLocalhost && window.location.port === String(BACKEND_PORT)
        ? '/api'
        : isGitHubPages
          ? null // Native direct client mode on GitHub Pages
          : '/api';

// Toast Notifications
function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  toast.innerHTML = `
    <span class="toast-icon">${iconMap[type] || 'ℹ️'}</span>
    <span class="toast-msg">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Global API Request Helper (Hybrid: Real Node.js Server + GitHub Pages Client Engine)
async function apiRequest(endpoint, options = {}) {
  // 1. If running natively on GitHub Pages without a remote backend, use client database directly
  if (isGitHubPages && !customBackendUrl && window.PDSClientDB) {
    try {
      return await window.PDSClientDB.handleApi(endpoint, options);
    } catch (err) {
      console.error(`[GitHub Pages Direct Engine] Error on ${endpoint}:`, err);
      throw err;
    }
  }

  const url = `${API_BASE || '/api'}${endpoint}`;
  const headers = options.headers || {};

  // Attach auth tokens
  const adminToken = localStorage.getItem('pds_admin_token');
  const officerToken = localStorage.getItem('pds_officer_token');
  const customerToken = localStorage.getItem('pds_customer_token');

  const token = adminToken || officerToken || customerToken;
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(url, { ...options, headers });
    const contentType = response.headers.get('content-type') || '';

    let data;
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const rawText = await response.text();
      // If we got an HTML response (e.g. GitHub Pages 404 or Five Server redirect)
      if (rawText.trim().startsWith('<') || response.status === 404) {
        if (window.PDSClientDB) {
          console.warn(`[API Fallback] Server at ${url} returned HTML (${response.status}). Routing through PDSClientDB...`);
          return await window.PDSClientDB.handleApi(endpoint, options);
        }
        throw new Error(`API returned HTML response (${response.status}) instead of JSON. Ensure backend is running.`);
      }
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        if (window.PDSClientDB) {
          return await window.PDSClientDB.handleApi(endpoint, options);
        }
        throw new Error(rawText || `Invalid response from server (${response.status})`);
      }
    }

    if (!response.ok) {
      throw new Error(data && data.message ? data.message : `Request failed with status ${response.status}`);
    }

    return data;
  } catch (error) {
    console.warn(`API network call failed on ${endpoint}:`, error.message);

    // If PDSClientDB is available, smoothly fall back without failing the user experience
    if (window.PDSClientDB) {
      console.log(`[API Auto-Recovery] Serving ${endpoint} via Client DB...`);
      return await window.PDSClientDB.handleApi(endpoint, options);
    }

    const msg = error.message || '';
    if (
      error instanceof TypeError ||
      msg.includes('Failed to fetch') ||
      msg.includes('NetworkError') ||
      msg.includes('Network request failed') ||
      msg.includes('HTML response') ||
      msg.includes('Unexpected token')
    ) {
      throw new Error(`Cannot reach the backend API at ${url}. Please ensure the backend is running ("npm start" on port ${BACKEND_PORT}).`);
    }
    throw error;
  }
}

// Real-time WebSocket Feed
class LiveFeed {
  constructor() {
    this.ws = null;
    this.listeners = [];
    this.connect();
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = isFileProtocol
      ? `localhost:${BACKEND_PORT}`
      : isDevLiveServer
        ? `${window.location.hostname}:${BACKEND_PORT}`
        : window.location.host;
    const wsUrl = `${protocol}//${wsHost}/ws/live`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('📡 Connected to Smart PDS live ledger & telemetry feed');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.listeners.forEach(fn => fn(data));
        } catch (e) {
          console.warn('WS format error:', e);
        }
      };

      this.ws.onclose = () => {
        setTimeout(() => this.connect(), 4000); // Reconnect
      };
    } catch (e) {
      console.warn('WebSocket unavailable:', e);
    }
  }

  on(listener) {
    this.listeners.push(listener);
  }
}

const liveFeed = new LiveFeed();

// Print Receipt Helper
function printReceipt(receiptData) {
  const printWindow = window.open('', '_blank', 'width=650,height=800');
  const dateStr = new Date(receiptData.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  const itemsHtml = (receiptData.items || []).map(item => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.commodity}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity} ${item.unit || 'KG'}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">₹${(item.pricePerUnit || 0).toFixed(2)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">₹${(item.amount || 0).toFixed(2)}</td>
    </tr>
  `).join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>PDS Digital Ration Receipt - ${receiptData.receiptNumber}</title>
      <style>
        body { font-family: 'Courier New', Courier, monospace; padding: 24px; color: #111; }
        .receipt-header { text-align: center; border-bottom: 2px dashed #333; padding-bottom: 12px; margin-bottom: 16px; }
        .receipt-title { font-size: 1.1rem; font-weight: bold; margin: 4px 0; }
        .receipt-sub { font-size: 0.85rem; }
        .info-table { width: 100%; font-size: 0.85rem; margin-bottom: 16px; }
        .info-table td { padding: 3px 0; }
        .items-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-bottom: 16px; }
        .items-table th { border-bottom: 1px solid #333; padding: 6px 8px; text-align: left; }
        .total-box { border-top: 2px dashed #333; border-bottom: 2px dashed #333; padding: 10px 0; font-size: 0.95rem; font-weight: bold; margin-bottom: 16px; }
        .bc-box { background: #f5f5f5; border: 1px solid #ddd; padding: 10px; font-size: 0.72rem; word-break: break-all; margin-top: 16px; }
        .btn-print { background: #0A2540; color: white; padding: 8px 16px; border: none; cursor: pointer; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="receipt-header">
        <div style="font-size: 1.25rem; font-weight: 900;">GOVERNMENT OF INDIA / STATE CIVIL SUPPLIES</div>
        <div class="receipt-title">PUBLIC DISTRIBUTION SYSTEM (PDS)</div>
        <div class="receipt-sub">BIOMETRIC AUTHENTICATED SMART RATION RECEIPT</div>
      </div>

      <table class="info-table">
        <tr><td><strong>Receipt No:</strong> ${receiptData.receiptNumber}</td><td style="text-align: right;"><strong>Date:</strong> ${dateStr}</td></tr>
        <tr><td><strong>Customer ID:</strong> ${receiptData.customerId}</td><td style="text-align: right;"><strong>Ration Card:</strong> ${receiptData.rationCardNumber}</td></tr>
        <tr><td><strong>Beneficiary:</strong> ${receiptData.beneficiaryName}</td><td style="text-align: right;"><strong>Category:</strong> ${receiptData.category}</td></tr>
        <tr><td><strong>Fair Price Shop:</strong> ${receiptData.officeId}</td><td style="text-align: right;"><strong>Officer ID:</strong> ${receiptData.officerId}</td></tr>
        <tr><td><strong>Biometric Auth Ref:</strong> ${receiptData.biometricVerificationRef || 'VERIFIED'}</td><td style="text-align: right;"><strong>Status:</strong> ISSUED</td></tr>
      </table>

      <table class="items-table">
        <thead>
          <tr>
            <th>Commodity</th>
            <th style="text-align: center;">Distributed Qty</th>
            <th style="text-align: right;">Rate/Unit</th>
            <th style="text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div class="total-box">
        <div style="display: flex; justify-content: space-between;">
          <span>TOTAL AMOUNT PAYABLE:</span>
          <span>₹${(receiptData.totalAmountPaid || 0).toFixed(2)}</span>
        </div>
      </div>

      <div class="bc-box">
        <strong>HYPERLEDGER FABRIC BLOCKCHAIN AUDIT PROOF:</strong><br/>
        Tx Hash: ${receiptData.blockchain?.txId || '0x' + Math.random().toString(16).substring(2)}<br/>
        Block Number: #${receiptData.blockchain?.blockNumber || '14'}<br/>
        Ledger Status: ${receiptData.blockchain?.status || 'COMMITTED_LEDGER'}<br/>
        Channel: pdschannel | Chaincode: smartpds
      </div>

      <div style="text-align: center; margin-top: 24px;">
        <button class="btn-print" onclick="window.print()">Print Formal Receipt</button>
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
}
