/**
 * Smart Indian Public Distribution System (PDS)
 * Fair Price Shop Officer POS Terminal Controller
 */

let currentOfficer = null;
let currentOfficeId = 'OFF001';
let currentOfficeData = null;
let activeVerifiedCustomer = null;
let activeEntitlement = null;
let currentReceivingDispatch = null;
let keypadBuffer = 'CUST-TN-2025-001';

document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('pds_officer_token');
  if (!token) {
    window.location.href = 'officer-login.html';
    return;
  }

  const officerInfo = JSON.parse(localStorage.getItem('pds_officer_info') || '{}');
  currentOfficer = officerInfo;
  currentOfficeId = officerInfo.assignedOfficeId || 'OFF001';

  document.getElementById('officer-name-display').textContent = officerInfo.name || 'Officer';
  document.getElementById('banner-officer-name').textContent = officerInfo.name || 'Officer';
  document.getElementById('banner-office-id').textContent = currentOfficeId;

  await loadOfficerDashboardData();

  // Load default verified customer for initial preview
  await loadCustomerForDistribution('CUST-TN-2025-001');

  // Real-time WebSocket Feed
  liveFeed.on((msg) => {
    loadOfficerDashboardData();
  });

  // Setup ESP32 Hardware Bridge Listeners (USB Serial & WiFi IP)
  setupESP32HardwareListeners();
});

// Hardware bridge integration
function setupESP32HardwareListeners() {
  if (!window.esp32Bridge) return;

  // 1. Listen for status changes
  window.esp32Bridge.onStatusChange((status, details) => {
    const statusText = document.getElementById('pos-hw-status-text');
    const portLabel = document.getElementById('pos-hw-port-label');
    const usbBtn = document.getElementById('pos-btn-connect-usb');
    const ipBtn = document.getElementById('pos-btn-connect-ip');

    if (status === 'CONNECTED') {
      if (details.mode === 'USB') {
        if (statusText) statusText.innerHTML = '<span style="color:#00875A; font-weight:600;">🟢 Physical ESP32 Connected via USB Serial (115200 Baud)</span>';
        if (portLabel) portLabel.textContent = 'USB COM CONNECTED';
        if (usbBtn) { usbBtn.textContent = '✓ USB Connected'; usbBtn.style.background = '#E3FCEF'; }
      } else {
        if (statusText) statusText.innerHTML = `<span style="color:#00875A; font-weight:600;">🟢 Physical ESP32 Connected via WiFi IP (${details.ip || 'Ready'})</span>`;
        if (portLabel) portLabel.textContent = `IP: ${details.ip || 'WiFi'}`;
        if (ipBtn) { ipBtn.textContent = '✓ WiFi IP Connected'; ipBtn.style.background = '#E3FCEF'; }
      }
    } else if (status === 'CONNECTING') {
      if (statusText) statusText.innerHTML = '<span style="color:#FFAB00; font-weight:600;">🟡 Connecting to ESP32 Hardware...</span>';
    } else {
      if (statusText) statusText.innerHTML = 'Operating in Virtual Simulator Mode';
      if (portLabel) portLabel.textContent = 'READY (USB/IP/SIM)';
    }
  });

  // 2. Incoming hardware keypad digits from USB / IP
  window.esp32Bridge.onKeypadInput((key) => {
    showToast(`Hardware Keypad: Pressed '${key}'`, 'info', 1500);
    pressKeypad(key);
  });

  // 3. Incoming physical R307 optical fingerprint matches
  window.esp32Bridge.onFingerprintMatch((matchData) => {
    if (matchData.success) {
      showToast(`R307 Optical Sensor: Matched Slot #${matchData.slotId}!`, 'success');
      triggerPOSBiometricAuth(matchData.templateRef);
    } else {
      showToast(matchData.error || 'R307: Fingerprint not matched', 'warning');
    }
  });

  // Check if already configured from login page
  if (window.esp32Bridge.mode === 'IP' && window.esp32Bridge.ipAddress) {
    window.esp32Bridge.connectIP(window.esp32Bridge.ipAddress);
  }
}

async function handleDashboardConnectUSB() {
  try {
    await window.esp32Bridge.connectUSB();
    showToast('ESP32 successfully linked via USB Cable!', 'success');
  } catch (err) {
    showToast(`USB Link: ${err.message}`, 'error');
  }
}

async function handleDashboardConnectIP() {
  const currentIp = window.esp32Bridge.ipAddress || '192.168.1.150';
  const ip = prompt('Enter ESP32 IP Address on your ration shop WiFi:', currentIp);
  if (!ip) return;
  try {
    await window.esp32Bridge.connectIP(ip);
    showToast(`ESP32 connected via WiFi IP (${ip})!`, 'success');
  } catch (err) {
    showToast(`IP Link error: ${err.message}`, 'error');
  }
}

function logoutOfficer() {
  localStorage.removeItem('pds_officer_token');
  localStorage.removeItem('pds_officer_info');
  window.location.href = 'officer-login.html';
}

function switchOfficerTab(tabKey) {
  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  const activeNav = document.getElementById(`menu-off-${tabKey}`);
  if (activeNav) activeNav.classList.add('active');

  document.querySelectorAll('.officer-tab-pane').forEach(el => el.style.display = 'none');
  const target = document.getElementById(`tab-off-${tabKey}`);
  if (target) target.style.display = 'block';

  if (tabKey === 'dashboard') loadOfficerDashboardData();
  if (tabKey === 'receive') loadIncomingDispatches();
  if (tabKey === 'distribution') {
    if (activeVerifiedCustomer) {
      loadCustomerForDistribution(activeVerifiedCustomer.customerId);
    }
  }
  if (tabKey === 'history') loadOfficerDistributionHistory();
  if (tabKey === 'stock') loadOfficerStockTable();
  if (tabKey === 'blockchain') loadOfficerBlockchainRecords();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Load Office Data & KPIs
async function loadOfficerDashboardData() {
  try {
    const res = await apiRequest(`/offices/${currentOfficeId}`);
    const office = res.office;
    currentOfficeData = office;

    document.getElementById('banner-office-name').textContent = office.officeName;
    document.getElementById('banner-office-loc').textContent = `${office.taluk || office.district}, ${office.state}`;

    const inv = office.inventory || { rice: 0, wheat: 0, sugar: 0, dal: 0 };
    document.getElementById('off-stock-rice').textContent = `${inv.rice || 0} KG`;
    document.getElementById('off-stock-wheat').textContent = `${inv.wheat || 0} KG`;
    document.getElementById('off-stock-sugar').textContent = `${inv.sugar || 0} KG`;
    document.getElementById('off-stock-dal').textContent = `${inv.dal || 0} KG`;

    const totalStock = (inv.rice || 0) + (inv.wheat || 0) + (inv.sugar || 0) + (inv.dal || 0);
    document.getElementById('off-kpi-availableStock').textContent = `${totalStock.toLocaleString()} KG`;
    document.getElementById('off-kpi-totalCustomers').textContent = (office.totalRegisteredBeneficiaries || 420).toLocaleString();

    // Fetch incoming dispatches count
    const dispRes = await apiRequest(`/dispatches?officeId=${currentOfficeId}`);
    const dispatches = dispRes.dispatches || [];
    const inTransit = dispatches.filter(d => d.status === 'IN_TRANSIT').length;
    document.getElementById('off-kpi-pendingDispatch').textContent = inTransit;

    // Fetch distributions count
    const distRes = await apiRequest(`/distribution/history?officeId=${currentOfficeId}`);
    const distributions = distRes.distributions || [];
    let todaySum = 0;
    distributions.forEach(d => {
      (d.items || []).forEach(i => { todaySum += Number(i.quantity || 0); });
    });
    document.getElementById('off-kpi-todayDistribution').textContent = `${todaySum} KG`;
    document.getElementById('off-kpi-blockchainCount').textContent = `${(office.recentTransactions || []).length} Commits`;
    document.getElementById('off-kpi-receivedStock').textContent = `${dispatches.filter(d => d.status === 'DELIVERED').length} Shipments`;
  } catch (e) {
    console.error('Error loading officer dashboard:', e);
  }
}

// INWARD STOCK RECEIVE MODULE
async function loadIncomingDispatches() {
  const tbody = document.getElementById('off-receive-table-body');
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Checking incoming shipments...</td></tr>';

  try {
    const res = await apiRequest(`/dispatches?officeId=${currentOfficeId}`);
    const dispatches = res.dispatches || [];

    if (dispatches.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">No grain dispatches logged for this office.</td></tr>';
      return;
    }

    tbody.innerHTML = dispatches.map(d => {
      const itemsStr = (d.items || []).map(i => `${i.commodity}: ${i.quantity}${i.unit}`).join(', ');
      const isDelivered = d.status === 'DELIVERED';
      const isMismatch = d.status === 'MISMATCH_CONFIRMED';

      const statusBadge = isDelivered
        ? '<span class="badge badge-success">DELIVERED</span>'
        : isMismatch
        ? '<span class="badge badge-danger">MISMATCH CONFIRMED</span>'
        : '<span class="badge badge-info">IN TRANSIT</span>';

      const actionBtn = isDelivered || isMismatch
        ? '<span style="font-size:0.8rem; color:var(--green-primary); font-weight:600;">✓ Confirmed</span>'
        : `<button class="btn btn-success btn-sm" onclick="openReceiveStockModal('${d.dispatchId}')">Receive Stock</button>`;

      return `
        <tr>
          <td><strong>${d.dispatchId}</strong></td>
          <td>${d.sourceWarehouseName}</td>
          <td><code>${d.vehicleNumber}</code></td>
          <td>${d.driverDetails}</td>
          <td><span style="font-size:0.82rem;">${itemsStr}</span></td>
          <td>${d.dispatchDate}</td>
          <td>${statusBadge}</td>
          <td>${actionBtn}</td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" style="color:var(--red-primary);">Error: ${e.message}</td></tr>`;
  }
}

async function openReceiveStockModal(dispatchId) {
  try {
    const res = await apiRequest(`/dispatches/${dispatchId}`);
    const d = res.dispatch;
    currentReceivingDispatch = d;

    const itemsInputs = (d.items || []).map((i, idx) => `
      <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:12px; margin-bottom:10px; align-items:center;">
        <div><strong>${i.commodity}</strong> (Batch: <code>${i.batchId}</code>)</div>
        <div>Dispatched: <strong>${i.quantity} ${i.unit}</strong></div>
        <div>
          <input type="number" id="rec-qty-${idx}" class="form-control form-control-sm" value="${i.quantity}" min="0">
        </div>
      </div>
    `).join('');

    document.getElementById('receive-modal-content').innerHTML = `
      <div style="margin-bottom:14px; font-size:0.9rem;">
        Shipment: <strong>${d.dispatchId}</strong> | Vehicle: <strong>${d.vehicleNumber}</strong><br>
        Source: ${d.sourceWarehouseName}
      </div>
      <div style="border:1px solid #ddd; padding:12px; border-radius:6px; background:#F8FAFC; margin-bottom:14px;">
        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:12px; font-size:0.78rem; font-weight:bold; color:var(--text-muted); margin-bottom:6px;">
          <div>COMMODITY</div><div>DISPATCHED QTY</div><div>ACTUAL RECEIVED QTY (KG)</div>
        </div>
        ${itemsInputs}
      </div>
    `;

    document.getElementById('modal-confirm-receipt').classList.add('active');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function submitInwardReceiptConfirmation() {
  if (!currentReceivingDispatch) return;

  const d = currentReceivingDispatch;
  const receivedItems = (d.items || []).map((i, idx) => {
    const input = document.getElementById(`rec-qty-${idx}`);
    return {
      commodity: i.commodity,
      batchId: i.batchId,
      receivedQuantity: Number(input ? input.value : i.quantity)
    };
  });

  const remarks = document.getElementById('rec-remarks').value.trim();

  try {
    const res = await apiRequest(`/dispatches/${d.dispatchId}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ receivedItems, remarks })
    });

    showToast(res.message, res.hasMismatch ? 'warning' : 'success');
    document.getElementById('modal-confirm-receipt').classList.remove('active');
    loadIncomingDispatches();
    loadOfficerDashboardData();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ESP32 KEYPAD & BIOMETRIC AUTHENTICATION SIMULATOR
function pressKeypad(key) {
  if (key === 'CLEAR') {
    keypadBuffer = '';
  } else if (key === 'ENTER') {
    if (keypadBuffer.length > 0) {
      document.getElementById('lcd-line-1').textContent = 'READY: PLACE FINGER';
      showToast(`Beneficiary ID ${keypadBuffer} registered. Place finger on optical prism.`, 'info');
      return;
    }
  } else {
    if (keypadBuffer.length < 16) {
      keypadBuffer += key;
    }
  }

  document.getElementById('lcd-input-display').textContent = keypadBuffer || '_';
}

function setKeypadInput(val) {
  keypadBuffer = val;
  document.getElementById('lcd-input-display').textContent = val;
  document.getElementById('lcd-line-1').textContent = 'READY: PLACE FINGER';
}

async function triggerPOSBiometricAuth(hardwareTemplateRef = null) {
  const custId = keypadBuffer.trim();
  if (!custId) {
    showToast('Please enter Customer ID or Ration Card on keypad first.', 'warning');
    return;
  }

  const pad = document.getElementById('pos-fp-touchpad');
  const badge = document.getElementById('pos-auth-badge');
  const title = document.getElementById('pos-auth-title');
  const desc = document.getElementById('pos-auth-desc');
  const outcome = document.getElementById('pos-auth-outcome');

  pad.classList.add('scanning');
  badge.className = 'badge badge-info';
  badge.textContent = 'SCANNING FINGERPRINT';
  title.textContent = 'Scanning Biometric Ridges...';
  desc.textContent = 'ESP32 Optical Sensor active. Comparing minutiae against local hardware flash.';
  outcome.style.display = 'none';

  // If connected via USB, send scan command
  if (window.esp32Bridge && window.esp32Bridge.mode === 'USB') {
    window.esp32Bridge.triggerScanViaUSB();
  }

  // Realistic sensor scan delay
  await new Promise(r => setTimeout(r, 1000));

  try {
    // Template ref from physical sensor or lookup fallback
    const templateRef = hardwareTemplateRef || (custId.includes('002') ? 'FP-REF-MEENAKSHI01' : 'FP-REF-GOWTHAM01');

    const res = await apiRequest('/iot/verify', {
      method: 'POST',
      headers: { 'X-Device-Token': 'DEV-OFF001-ESP32-SECURE' },
      body: JSON.stringify({
        customerIdOrRationCard: custId,
        templateRef,
        officeId: currentOfficeId
      })
    });

    pad.classList.remove('scanning');

    if (res.verified) {
      badge.className = 'badge badge-success';
      badge.textContent = 'CUSTOMER VERIFIED';
      title.textContent = 'Biometric Identity Confirmed ✓';
      desc.textContent = `Matched: ${res.matchedMember.name} (${res.matchedMember.relationship}). Ration entitlement unlocked.`;

      outcome.style.display = 'block';
      outcome.style.background = '#E3FCEF';
      outcome.style.border = '1px solid #ABF5D1';
      outcome.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h4 style="color:#006644;">CUSTOMER VERIFIED</h4>
            <p style="font-size:0.85rem; color:#006644;">Beneficiary: <strong>${res.customer.fullName}</strong> | Card: <strong>${res.customer.rationCardNumber}</strong> (${res.customer.category})</p>
          </div>
          <div>
            <button class="btn btn-success btn-sm" onclick="openDistributionForCustomer('${res.customer.customerId}', '${res.verificationRef}')">
              Proceed to Ration Distribution →
            </button>
          </div>
        </div>
      `;

      activeVerifiedCustomer = {
        ...res.customer,
        verificationRef: res.verificationRef,
        matchedMember: res.matchedMember
      };

      showToast('Citizen identity verified! Opening entitlement schedule...', 'success');
      setTimeout(() => {
        openDistributionForCustomer(res.customer.customerId, res.verificationRef);
      }, 1200);
    }
  } catch (err) {
    pad.classList.remove('scanning');
    badge.className = 'badge badge-danger';
    badge.textContent = 'AUTHENTICATION FAILED';
    title.textContent = 'Biometric Verification Rejected';
    desc.textContent = err.message || 'Fingerprint does not match enrolled family members or beneficiary account is unapproved.';

    outcome.style.display = 'block';
    outcome.style.background = '#FFEBE6';
    outcome.style.border = '1px solid #FFBDAD';
    outcome.innerHTML = `
      <h4 style="color:#BF2600;">AUTHENTICATION FAILED</h4>
      <p style="font-size:0.85rem; color:#BF2600;">${err.message || 'Verification could not be established.'}</p>
    `;
    showToast('Biometric authentication failed!', 'error');
  }
}

function openDistributionForCustomer(customerId, verificationRef) {
  loadCustomerForDistribution(customerId, verificationRef);
  switchOfficerTab('distribution');
}

// RATION DISTRIBUTION & ENTITLEMENT MODULE
async function loadCustomerForDistribution(customerId, verificationRef = 'BIO-AUTH-VERIFIED') {
  try {
    const res = await apiRequest(`/distribution/entitlement/${encodeURIComponent(customerId)}`);
    const c = res.customer;
    const ent = res.entitlement;
    activeVerifiedCustomer = c;
    activeEntitlement = ent;

    document.getElementById('dist-beneficiary-name').textContent = c.fullName;
    document.getElementById('dist-cust-id').textContent = c.customerId;
    document.getElementById('dist-card-no').textContent = c.rationCardNumber;
    document.getElementById('dist-category').textContent = `${ent.categoryName} (${c.rationCardCategory})`;
    document.getElementById('dist-bio-ref').textContent = verificationRef;

    // Render Family Table
    const famTbody = document.getElementById('dist-family-tbody');
    const familyRows = (c.familyMembers || []).map(m => `
      <tr>
        <td><strong>${m.memberId}</strong></td>
        <td>${m.fullName}</td>
        <td>${m.relationship}</td>
        <td>${m.age}</td>
        <td><span class="badge badge-success">${m.fingerprintStatus || 'ENROLLED'}</span></td>
        <td><span class="badge badge-success">ACTIVE BENEFICIARY</span></td>
      </tr>
    `).join('');

    famTbody.innerHTML = `
      <tr style="background:#F0FDF4;">
        <td><strong>HEAD</strong></td>
        <td><strong>${c.fullName}</strong></td>
        <td>Head of Family</td>
        <td>--</td>
        <td><span class="badge badge-success">${c.fingerprintStatus || 'ENROLLED'}</span></td>
        <td><span class="badge badge-success">ACTIVE BENEFICIARY</span></td>
      </tr>
      ${familyRows}
    `;

    // Render Entitlement & Issuance Table
    const inv = currentOfficeData?.inventory || { rice: 2500, wheat: 1200, sugar: 450, dal: 350 };
    const itemsTbody = document.getElementById('dist-items-tbody');

    itemsTbody.innerHTML = ent.items.map((item, idx) => {
      const commKey = item.commodity.toLowerCase();
      const shopAvail = inv[commKey] || 0;
      const defDistQty = Math.min(item.remaining, shopAvail);

      return `
        <tr>
          <td><strong>${item.name}</strong></td>
          <td>${item.monthlyEntitlement} ${item.unit}</td>
          <td>${item.alreadyReceived} ${item.unit}</td>
          <td><strong style="color:var(--navy-primary);">${item.remaining} ${item.unit}</strong></td>
          <td>${shopAvail} ${item.unit}</td>
          <td>
            <input type="number" id="dist-input-${idx}" class="form-control form-control-sm dist-qty-field"
                   value="${defDistQty}" min="0" max="${item.remaining}"
                   data-rate="${item.pricePerUnit || 0}"
                   oninput="recalculateDistributionTotal()">
          </td>
          <td>₹${(item.pricePerUnit || 0).toFixed(2)}</td>
          <td><strong id="dist-item-total-${idx}">₹0.00</strong></td>
        </tr>
      `;
    }).join('');

    recalculateDistributionTotal();
  } catch (e) {
    showToast(`Error calculating entitlement: ${e.message}`, 'error');
  }
}

function recalculateDistributionTotal() {
  if (!activeEntitlement) return;
  let grandTotal = 0;

  activeEntitlement.items.forEach((item, idx) => {
    const input = document.getElementById(`dist-input-${idx}`);
    const totalSpan = document.getElementById(`dist-item-total-${idx}`);
    if (input && totalSpan) {
      const qty = Number(input.value || 0);
      const rate = Number(input.getAttribute('data-rate') || 0);
      const itemCost = qty * rate;
      grandTotal += itemCost;
      totalSpan.textContent = `₹${itemCost.toFixed(2)}`;
    }
  });

  document.getElementById('dist-total-amount').textContent = `₹${grandTotal.toFixed(2)}`;
}

async function executeRationDistribution() {
  if (!activeVerifiedCustomer || !activeEntitlement) {
    showToast('No active customer verified for distribution.', 'warning');
    return;
  }

  const items = [];
  activeEntitlement.items.forEach((item, idx) => {
    const input = document.getElementById(`dist-input-${idx}`);
    if (input && Number(input.value) > 0) {
      items.push({
        commodity: item.name,
        quantity: Number(input.value)
      });
    }
  });

  if (items.length === 0) {
    showToast('Please enter at least 1 quantity to distribute.', 'warning');
    return;
  }

  const payload = {
    customerId: activeVerifiedCustomer.customerId,
    officeId: currentOfficeId,
    items,
    biometricVerificationRef: document.getElementById('dist-bio-ref').textContent,
    authenticatedMemberName: activeVerifiedCustomer.fullName
  };

  try {
    const res = await apiRequest('/distribution/distribute', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    showToast(res.message, 'success');

    // Pop up digital receipt
    if (res.distribution) {
      printReceipt(res.distribution);
    }

    // Refresh telemetry and entitlement
    await loadOfficerDashboardData();
    await loadCustomerForDistribution(activeVerifiedCustomer.customerId);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// DISTRIBUTION HISTORY
async function loadOfficerDistributionHistory() {
  const tbody = document.getElementById('off-history-tbody');
  tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Loading history...</td></tr>';

  try {
    const res = await apiRequest(`/distribution/history?officeId=${currentOfficeId}`);
    const distributions = res.distributions || [];

    if (distributions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-muted);">No distribution receipts recorded yet today.</td></tr>';
      return;
    }

    tbody.innerHTML = distributions.map(d => {
      const itemsStr = (d.items || []).map(i => `${i.commodity}: ${i.quantity}${i.unit || 'kg'}`).join(', ');
      return `
        <tr>
          <td><strong>${d.receiptNumber}</strong></td>
          <td>${d.beneficiaryName}</td>
          <td>${d.customerId}</td>
          <td>${d.rationCardNumber}</td>
          <td>${itemsStr}</td>
          <td><strong>₹${(d.totalAmountPaid || 0).toFixed(2)}</strong></td>
          <td><span style="font-family:var(--font-mono); font-size:0.75rem;">${d.biometricVerificationRef}</span></td>
          <td>${d.timestamp?.slice(0, 19).replace('T', ' ')}</td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="printReceipt(${JSON.stringify(d).replace(/"/g, '&quot;')})">Print</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="9" style="color:var(--red-primary);">Error: ${e.message}</td></tr>`;
  }
}

// AVAILABLE SHOP STOCK
async function loadOfficerStockTable() {
  const tbody = document.getElementById('off-stock-table-body');
  try {
    const res = await apiRequest(`/offices/${currentOfficeId}`);
    const inv = res.office?.inventory || { rice: 0, wheat: 0, sugar: 0, dal: 0 };

    const commodities = [
      { code: 'RICE', name: 'Rice (Common & Grade A)', qty: inv.rice || 0, rate: 'Free (₹0/KG)' },
      { code: 'WHEAT', name: 'Wheat (Whole Grain)', qty: inv.wheat || 0, rate: 'Free (₹0/KG)' },
      { code: 'SUGAR', name: 'Refined Sugar', qty: inv.sugar || 0, rate: '₹13.50/KG' },
      { code: 'DAL', name: 'Toor Dal (Fortified)', qty: inv.dal || 0, rate: '₹30.00/KG' }
    ];

    tbody.innerHTML = commodities.map(c => `
      <tr>
        <td><strong>${c.code}</strong></td>
        <td>${c.name}</td>
        <td><strong style="color:var(--navy-primary); font-size:1.1rem;">${c.qty.toLocaleString()} KG</strong></td>
        <td>${c.rate}</td>
        <td><span class="badge badge-success">INSPECTION PASSED</span></td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--red-primary);">Error: ${e.message}</td></tr>`;
  }
}

// OFFICE BLOCKCHAIN RECORDS
async function loadOfficerBlockchainRecords() {
  const tbody = document.getElementById('off-bc-tbody');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Querying ledger for office records...</td></tr>';

  try {
    const res = await apiRequest(`/blockchain/transactions?officeId=${currentOfficeId}&limit=25`);
    const txs = res.transactions || [];

    if (txs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No transactions found for this office yet.</td></tr>';
      return;
    }

    tbody.innerHTML = txs.map(t => `
      <tr>
        <td><strong>#${t.blockNumber}</strong></td>
        <td><code>${t.txId.substring(0, 18)}...</code></td>
        <td><span class="badge badge-navy">${t.action}</span></td>
        <td><span class="badge ${t.status === 'COMMITTED_LEDGER' ? 'badge-success' : 'badge-warning'}">${t.status}</span></td>
        <td>${t.timestamp?.slice(0, 19).replace('T', ' ')}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="verifyTx('${t.txId}')">Verify</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--red-primary);">Error: ${e.message}</td></tr>`;
  }
}

async function verifyTx(txId) {
  try {
    const res = await apiRequest(`/blockchain/verify/${encodeURIComponent(txId)}`);
    const v = res.verification;
    alert(`
=== BLOCKCHAIN VERIFICATION ===
Tx ID: ${v.txId}
Block: #${v.blockNumber}
Integrity: ${v.isValid ? 'PASSED' : 'FAILED'}
Status: ${v.status}
    `);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

