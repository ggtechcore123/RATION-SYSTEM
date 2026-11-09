/**
 * Smart Indian Public Distribution System (PDS)
 * Administrative Command Dashboard Controller
 */

let charts = {};
let currentReviewCustomer = null;
let cachedBatches = [];
let cachedOffices = [];
let cachedOfficers = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Check Admin Auth
  const token = localStorage.getItem('pds_admin_token');
  if (!token) {
    window.location.href = 'admin-login.html';
    return;
  }

  const user = JSON.parse(localStorage.getItem('pds_admin_user') || '{}');
  if (user && user.name) {
    document.getElementById('admin-user-display').textContent = user.name;
  }

  // Set default date for modals
  const today = new Date().toISOString().slice(0, 10);
  const dateInput = document.getElementById('stk-date');
  if (dateInput) dateInput.value = today;

  // Initialize Overview Tab
  await loadDashboardAnalytics();
  await preloadFormData();

  // Listen to WebSocket live updates
  liveFeed.on((msg) => {
    console.log('Real-time ledger event received:', msg);
    loadDashboardAnalytics();
  });
});

function logoutAdmin() {
  localStorage.removeItem('pds_admin_token');
  localStorage.removeItem('pds_admin_user');
  window.location.href = 'admin-login.html';
}

// Modal Helpers
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

// Switch Sidebar Tabs
function switchAdminTab(tabKey) {
  // Update sidebar active class
  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  const activeNav = document.getElementById(`menu-${tabKey}`);
  if (activeNav) activeNav.classList.add('active');

  // Switch tab pane
  document.querySelectorAll('.admin-tab-pane').forEach(el => el.style.display = 'none');
  const targetPane = document.getElementById(`tab-${tabKey}`);
  if (targetPane) targetPane.style.display = 'block';

  // Load relevant data
  if (tabKey === 'dashboard') loadDashboardAnalytics();
  if (tabKey === 'customers') loadCustomersTable();
  if (tabKey === 'families') lookupFamilyUnit();
  if (tabKey === 'offices') loadOfficesTable();
  if (tabKey === 'officers') loadOfficersTable();
  if (tabKey === 'warehouses') loadWarehousesTable();
  if (tabKey === 'stock') loadStockBatchesTable();
  if (tabKey === 'dispatches') loadDispatchesTable();
  if (tabKey === 'distributions') loadDistributionsTable();
  if (tabKey === 'blockchain') loadBlockchainTab();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Preload data for forms
async function preloadFormData() {
  try {
    const [officesRes, batchesRes, officersRes] = await Promise.all([
      apiRequest('/offices'),
      apiRequest('/stock/batches'),
      apiRequest('/officers')
    ]);

    cachedOffices = officesRes.offices || [];
    cachedBatches = batchesRes.batches || [];
    cachedOfficers = officersRes.officers || [];

    // Populate offices dropdown for officer creation
    const ofrOfficeSelect = document.getElementById('ofr-officeId');
    if (ofrOfficeSelect) {
      ofrOfficeSelect.innerHTML = cachedOffices.map(o => `
        <option value="${o.id}">${o.id} - ${o.officeName} (${o.district})</option>
      `).join('');
    }

    // Populate officers dropdown for office creation
    const offOfficerSelect = document.getElementById('off-officerId');
    if (offOfficerSelect) {
      offOfficerSelect.innerHTML = '<option value="">-- Leave Unassigned for now --</option>' +
        cachedOfficers.map(o => `
          <option value="${o.officerId}">${o.officerId} - ${o.name}</option>
        `).join('');
    }

    // Populate destination offices for dispatch modal
    const dspDestSelect = document.getElementById('dsp-dest');
    if (dspDestSelect) {
      dspDestSelect.innerHTML = cachedOffices.map(o => `
        <option value="${o.id}">${o.id} - ${o.officeName}</option>
      `).join('');
    }
  } catch (e) {
    console.warn('Preload error:', e);
  }
}

// TAB 1: DASHBOARD TELEMETRY & CHARTS
async function loadDashboardAnalytics() {
  try {
    const res = await apiRequest('/reports/dashboard-analytics');
    if (!res.success) return;

    const m = res.metrics;
    document.getElementById('kpi-totalCustomers').textContent = m.totalRegisteredCustomers.toLocaleString();
    document.getElementById('kpi-totalFamilyMembers').textContent = m.totalFamilyMembers.toLocaleString();
    document.getElementById('kpi-totalOffices').textContent = m.totalOffices.toLocaleString();
    document.getElementById('kpi-totalOfficers').textContent = m.totalOfficers.toLocaleString();
    document.getElementById('kpi-totalWarehouses').textContent = m.totalWarehouses.toLocaleString();
    document.getElementById('kpi-totalStock').textContent = `${(m.totalAvailableStockKg || 0).toLocaleString()} KG`;
    document.getElementById('kpi-dispatchedStock').textContent = `${(m.totalDispatchedStockKg || 0).toLocaleString()} KG`;
    document.getElementById('kpi-distributedStock').textContent = `${(m.totalDistributedStockKg || 0).toLocaleString()} KG`;
    document.getElementById('kpi-pendingApprovals').textContent = m.pendingCustomerApprovals;
    document.getElementById('kpi-pendingDispatches').textContent = m.pendingStockDispatches;
    document.getElementById('kpi-blockchainTxs').textContent = `${m.totalBlockchainTransactions} Blocks`;

    // Render Charts
    renderCharts(res.charts);
  } catch (e) {
    console.error('Error loading analytics:', e);
  }
}

function renderCharts(cData) {
  if (!window.Chart) return;

  // 1. Monthly Distribution Trend
  const ctxMonthly = document.getElementById('chart-monthlyDistribution')?.getContext('2d');
  if (ctxMonthly) {
    if (charts.monthly) charts.monthly.destroy();
    charts.monthly = new Chart(ctxMonthly, {
      type: 'line',
      data: {
        labels: cData.monthlyDistribution.labels,
        datasets: [{
          label: 'Total Grain Distributed (KG)',
          data: cData.monthlyDistribution.data,
          borderColor: '#00875A',
          backgroundColor: 'rgba(0, 135, 90, 0.1)',
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: '#00875A'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  // 2. Commodity Stock Pie Chart
  const ctxComm = document.getElementById('chart-commodityStock')?.getContext('2d');
  if (ctxComm) {
    if (charts.commodity) charts.commodity.destroy();
    charts.commodity = new Chart(ctxComm, {
      type: 'doughnut',
      data: {
        labels: cData.commodityStock.labels,
        datasets: [{
          data: cData.commodityStock.data,
          backgroundColor: ['#0A2540', '#00875A', '#FFAB00', '#DE350B']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  // 3. Office Distribution Bar Chart
  const ctxOffice = document.getElementById('chart-officeDistribution')?.getContext('2d');
  if (ctxOffice) {
    if (charts.office) charts.office.destroy();
    charts.office = new Chart(ctxOffice, {
      type: 'bar',
      data: {
        labels: cData.officeDistribution.labels,
        datasets: [{
          label: 'Distribution (KG)',
          data: cData.officeDistribution.data,
          backgroundColor: '#0052CC',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });
  }

  // 4. Warehouse Capacity Bar Chart
  const ctxWh = document.getElementById('chart-warehouseStock')?.getContext('2d');
  if (ctxWh) {
    if (charts.warehouse) charts.warehouse.destroy();
    charts.warehouse = new Chart(ctxWh, {
      type: 'bar',
      data: {
        labels: cData.warehouseStock.labels,
        datasets: [{
          label: 'Stock Buffer (Tons)',
          data: cData.warehouseStock.data,
          backgroundColor: '#FFAB00',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });
  }
}

// TAB 2: CUSTOMERS MANAGEMENT
async function loadCustomersTable() {
  const status = document.getElementById('cust-filter-status').value;
  const search = document.getElementById('cust-search-input').value.trim();
  const tbody = document.getElementById('customers-table-body');
  tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Loading beneficiaries...</td></tr>';

  try {
    let url = '/customers?';
    if (status) url += `status=${status}&`;
    if (search) url += `search=${encodeURIComponent(search)}`;

    const res = await apiRequest(url);
    const customers = res.customers || [];

    if (customers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color:var(--text-muted);">No beneficiary records match criteria.</td></tr>';
      return;
    }

    tbody.innerHTML = customers.map(c => {
      const statusBadge = c.status === 'APPROVED'
        ? '<span class="badge badge-success">APPROVED</span>'
        : c.status === 'PENDING'
        ? '<span class="badge badge-warning">PENDING</span>'
        : '<span class="badge badge-danger">REJECTED</span>';

      const memCount = Array.isArray(c.familyMembers) ? c.familyMembers.length + 1 : 1;

      return `
        <tr>
          <td><strong>${c.customerId}</strong></td>
          <td>${c.fullName}</td>
          <td>${c.rationCardNumber}</td>
          <td><span class="badge badge-navy">${c.rationCardCategory}</span></td>
          <td>${c.mobileNumber}</td>
          <td>${c.assignedOfficeName || c.assignedOfficeId}</td>
          <td>${memCount} Pers</td>
          <td><span style="font-family:var(--font-mono); font-size:0.75rem;">${c.fingerprintRef ? 'ENROLLED' : 'NONE'}</span></td>
          <td>${statusBadge}</td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="openCustomerReviewModal('${c.customerId}')">Review</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="10" style="color:var(--red-primary);">Error: ${e.message}</td></tr>`;
  }
}

async function openCustomerReviewModal(customerId) {
  try {
    const res = await apiRequest(`/customers/${customerId}`);
    const c = res.customer;
    currentReviewCustomer = c;

    document.getElementById('rev-customer-title').textContent = `Beneficiary Review: ${c.fullName} (${c.customerId})`;
    document.getElementById('rev-reject-reason').value = '';

    const membersHtml = (c.familyMembers || []).map(m => `
      <li>${m.fullName} (${m.relationship}, Age: ${m.age}) - FP: <code>${m.fingerprintRef || 'Not Enrolled'}</code></li>
    `).join('') || '<li>No additional family members registered.</li>';

    const docsHtml = c.documents ? `
      <div style="background:#F0FDF4; border:1px solid #BBF7D0; padding:12px; border-radius:6px; margin-bottom:14px;">
        <strong style="color:var(--navy-primary);">Uploaded Verification Documents:</strong>
        <div style="display:flex; gap:12px; margin-top:8px; flex-wrap:wrap;">
          ${c.documents.rationCardDoc ? `<a href="${c.documents.rationCardDoc}" target="_blank" class="btn btn-outline btn-sm" style="background:white;">📄 Ration Card Proof ↗</a>` : ''}
          ${c.documents.addressProofDoc ? `<a href="${c.documents.addressProofDoc}" target="_blank" class="btn btn-outline btn-sm" style="background:white;">🏠 Address Proof ↗</a>` : ''}
          ${c.documents.identityProofDoc ? `<a href="${c.documents.identityProofDoc}" target="_blank" class="btn btn-outline btn-sm" style="background:white;">🆔 Identity Proof ↗</a>` : ''}
        </div>
      </div>
    ` : '';

    document.getElementById('rev-customer-content').innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:16px;">
        <div><strong>Ration Card:</strong> ${c.rationCardNumber} (${c.rationCardCategory})</div>
        <div><strong>Mobile:</strong> ${c.mobileNumber}</div>
        <div><strong>Current Status:</strong> <span class="badge badge-warning">${c.status}</span></div>
        <div><strong>Assigned Office:</strong> ${c.assignedOfficeName || c.assignedOfficeId}</div>
        <div style="grid-column: span 2;"><strong>Address:</strong> ${c.address}, ${c.taluk}, ${c.district} - ${c.pincode}</div>
        <div style="grid-column: span 2;"><strong>Biometric Template Ref:</strong> <code>${c.fingerprintRef || 'N/A'}</code></div>
      </div>
      ${docsHtml}
      <div style="background:#F8FAFC; padding:12px; border-radius:6px; margin-bottom:14px;">
        <strong>Registered Family Unit (${(c.familyMembers || []).length + 1} members):</strong>
        <ul style="margin: 8px 0 0 20px; font-size:0.85rem;">
          <li><strong>Head:</strong> ${c.fullName} (Enrolled FP: <code>${c.fingerprintRef}</code>)</li>
          ${membersHtml}
        </ul>
      </div>
    `;

    openModal('modal-customer-review');
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
}

async function confirmCustomerApproval() {
  if (!currentReviewCustomer) return;
  try {
    const res = await apiRequest(`/customers/${currentReviewCustomer.customerId}/approve`, {
      method: 'POST'
    });
    showToast(res.message, 'success');
    closeModal('modal-customer-review');
    loadCustomersTable();
    loadDashboardAnalytics();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function confirmCustomerRejection() {
  if (!currentReviewCustomer) return;
  const reason = document.getElementById('rev-reject-reason').value.trim() || 'Eligibility criteria not met';
  try {
    const res = await apiRequest(`/customers/${currentReviewCustomer.customerId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
    showToast(res.message, 'warning');
    closeModal('modal-customer-review');
    loadCustomersTable();
    loadDashboardAnalytics();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// TAB 3: FAMILY & BIOMETRICS LOOKUP
async function lookupFamilyUnit() {
  const id = document.getElementById('family-search-id').value.trim();
  const display = document.getElementById('family-unit-display');
  if (!id) return;

  display.innerHTML = '<p>Searching family unit...</p>';

  try {
    const res = await apiRequest(`/customers/${id}`);
    const c = res.customer;

    const membersRows = (c.familyMembers || []).map(m => `
      <tr>
        <td><strong>${m.memberId}</strong></td>
        <td>${m.fullName}</td>
        <td>${m.relationship}</td>
        <td>${m.age}</td>
        <td>${m.gender}</td>
        <td>${m.occupation || 'N/A'}</td>
        <td><span class="badge badge-success">${m.fingerprintStatus || 'ENROLLED'}</span></td>
        <td><code>${m.fingerprintRef || 'N/A'}</code></td>
      </tr>
    `).join('');

    display.innerHTML = `
      <div class="card" style="margin-bottom:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #ddd; padding-bottom:12px; margin-bottom:16px;">
          <div>
            <h3 style="color:var(--navy-primary); font-size:1.2rem;">${c.fullName} - Family Unit</h3>
            <p style="font-size:0.85rem; color:var(--text-muted);">Customer ID: <strong>${c.customerId}</strong> | Card: <strong>${c.rationCardNumber}</strong> | Category: <strong>${c.rationCardCategory}</strong></p>
          </div>
          <div>
            <span class="badge ${c.status === 'APPROVED' ? 'badge-success' : 'badge-warning'}">${c.status}</span>
          </div>
        </div>

        <h4 style="font-size:0.95rem; margin-bottom:10px; color:var(--navy-primary);">Eligible Family Members & Biometric Templates:</h4>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Member ID</th>
                <th>Full Name</th>
                <th>Relation</th>
                <th>Age</th>
                <th>Gender</th>
                <th>Occupation</th>
                <th>Biometrics</th>
                <th>Template Hash Reference</th>
              </tr>
            </thead>
            <tbody>
              <tr style="background:#F0FDF4;">
                <td><strong>HEAD</strong></td>
                <td><strong>${c.fullName}</strong></td>
                <td>Head of Household</td>
                <td>--</td>
                <td>${c.gender}</td>
                <td>--</td>
                <td><span class="badge badge-success">${c.fingerprintStatus || 'ENROLLED'}</span></td>
                <td><code>${c.fingerprintRef}</code></td>
              </tr>
              ${membersRows}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    display.innerHTML = `<div style="color:var(--red-primary);">Beneficiary record ${id} not found.</div>`;
  }
}

// TAB 4: OFFICE MANAGEMENT
async function loadOfficesTable() {
  const tbody = document.getElementById('offices-table-body');
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading offices...</td></tr>';

  try {
    const res = await apiRequest('/offices');
    const offices = res.offices || [];
    cachedOffices = offices;

    tbody.innerHTML = offices.map(o => {
      const inv = o.inventory || {};
      const stockSummary = `Rice: ${inv.rice || 0}kg | Wheat: ${inv.wheat || 0}kg | Sugar: ${inv.sugar || 0}kg`;

      return `
        <tr>
          <td><strong>${o.officeId || o.id}</strong></td>
          <td>${o.officeName}</td>
          <td>${o.district}, ${o.state}</td>
          <td>${o.contactNumber || 'N/A'}</td>
          <td>${o.assignedOfficerName ? `👨‍💼 ${o.assignedOfficerName}` : '<span style="color:var(--text-muted);">Unassigned</span>'}</td>
          <td><span style="font-size:0.8rem; font-family:var(--font-mono);">${stockSummary}</span></td>
          <td><span class="badge ${o.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}">${o.status}</span></td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="toggleOfficeStatus('${o.id}', '${o.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'}')">
              ${o.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" style="color:var(--red-primary);">Error: ${e.message}</td></tr>`;
  }
}

function openCreateOfficeModal() {
  openModal('modal-create-office');
}

async function handleCreateOffice(e) {
  e.preventDefault();
  const payload = {
    officeName: document.getElementById('off-name').value.trim(),
    state: document.getElementById('off-state').value.trim(),
    district: document.getElementById('off-district').value.trim(),
    taluk: document.getElementById('off-taluk').value.trim(),
    village: document.getElementById('off-village').value.trim(),
    pincode: document.getElementById('off-pincode').value.trim(),
    contactNumber: document.getElementById('off-contact').value.trim(),
    address: document.getElementById('off-address').value.trim(),
    assignedOfficerId: document.getElementById('off-officerId').value || null
  };

  try {
    const res = await apiRequest('/offices', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showToast(res.message, 'success');
    closeModal('modal-create-office');
    loadOfficesTable();
    loadDashboardAnalytics();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleOfficeStatus(officeId, newStatus) {
  try {
    await apiRequest(`/offices/${officeId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });
    showToast(`Office status updated to ${newStatus}`, 'success');
    loadOfficesTable();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// TAB 5: OFFICER MANAGEMENT
async function loadOfficersTable() {
  const tbody = document.getElementById('officers-table-body');
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading officers...</td></tr>';

  try {
    const res = await apiRequest('/officers');
    const officers = res.officers || [];
    cachedOfficers = officers;

    tbody.innerHTML = officers.map(o => `
      <tr>
        <td><strong>${o.officerId}</strong></td>
        <td>${o.name}</td>
        <td><code>${o.username}</code></td>
        <td><strong>${o.assignedOfficeId}</strong> (${o.assignedOfficeName || 'FPS'})</td>
        <td>${o.mobileNumber || 'N/A'}</td>
        <td><span class="badge badge-navy">${o.role}</span></td>
        <td><span class="badge ${o.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}">${o.status}</span></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="promptResetOfficerPassword('${o.officerId}')">Reset Key</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" style="color:var(--red-primary);">Error: ${e.message}</td></tr>`;
  }
}

function openCreateOfficerModal() {
  openModal('modal-create-officer');
}

async function handleCreateOfficer(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('ofr-name').value.trim(),
    username: document.getElementById('ofr-username').value.trim(),
    password: document.getElementById('ofr-password').value,
    mobileNumber: document.getElementById('ofr-mobile').value.trim(),
    assignedOfficeId: document.getElementById('ofr-officeId').value
  };

  try {
    const res = await apiRequest('/officers', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showToast(res.message, 'success');
    closeModal('modal-create-officer');
    loadOfficersTable();
    loadDashboardAnalytics();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function promptResetOfficerPassword(officerId) {
  const newPass = prompt(`Enter new password for Officer ${officerId}:`, 'Password123!');
  if (!newPass) return;
  try {
    const res = await apiRequest(`/officers/${officerId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword: newPass })
    });
    showToast(res.message, 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// TAB 6: WAREHOUSES
async function loadWarehousesTable() {
  const tbody = document.getElementById('warehouses-table-body');
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading warehouses...</td></tr>';

  try {
    const res = await apiRequest('/warehouses');
    const warehouses = res.warehouses || [];

    tbody.innerHTML = warehouses.map(w => `
      <tr>
        <td><strong>${w.id}</strong></td>
        <td>${w.name}</td>
        <td><span class="badge badge-navy">${w.type}</span></td>
        <td>${w.district}, ${w.state}</td>
        <td>${(w.capacityTons || 5000).toLocaleString()} Tons</td>
        <td>${w.activeBatchesCount || 0} Batches</td>
        <td><strong>${(w.totalStockKg || 0).toLocaleString()} KG</strong></td>
        <td><span class="badge badge-success">${w.status}</span></td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" style="color:var(--red-primary);">Error: ${e.message}</td></tr>`;
  }
}

// TAB 7: STOCK & BATCHES
async function loadStockBatchesTable() {
  const tbody = document.getElementById('stock-table-body');
  tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Loading stock batches...</td></tr>';

  try {
    const res = await apiRequest('/stock/batches');
    const batches = res.batches || [];
    cachedBatches = batches;

    tbody.innerHTML = batches.map(b => `
      <tr>
        <td><strong>${b.batchId}</strong></td>
        <td>${b.commodityName}</td>
        <td>${b.warehouseId}</td>
        <td>${Number(b.quantity).toLocaleString()} ${b.unit}</td>
        <td><strong style="color:var(--green-primary);">${Number(b.availableQuantity).toLocaleString()} ${b.unit}</strong></td>
        <td>${b.procurementDate}</td>
        <td>${b.supplier}</td>
        <td><span class="badge badge-success">${b.status}</span></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="promptStockAdjustment('${b.batchId}')">Adjust</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="9" style="color:var(--red-primary);">Error: ${e.message}</td></tr>`;
  }
}

function openAddStockModal() {
  openModal('modal-add-stock');
}

async function handleAddStock(e) {
  e.preventDefault();
  const payload = {
    commodityName: document.getElementById('stk-commodity').value,
    quantity: document.getElementById('stk-quantity').value,
    unit: 'KG',
    warehouseId: document.getElementById('stk-warehouse').value,
    procurementDate: document.getElementById('stk-date').value,
    supplier: document.getElementById('stk-supplier').value.trim()
  };

  try {
    const res = await apiRequest('/stock/add', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showToast(res.message, 'success');
    closeModal('modal-add-stock');
    loadStockBatchesTable();
    loadDashboardAnalytics();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function promptStockAdjustment(batchId) {
  const adj = prompt(`Enter quantity adjustment in KG for ${batchId} (e.g. -50 for moisture loss, or +100):`, '-50');
  if (!adj) return;
  const reason = prompt('Enter authorized reason for adjustment:', 'Routine silo weigh-bridge moisture recalibration');
  if (!reason) return;

  try {
    const res = await apiRequest('/stock/adjust', {
      method: 'POST',
      body: JSON.stringify({ batchId, adjustedQty: Number(adj), reason })
    });
    showToast(res.message, 'success');
    loadStockBatchesTable();
    loadDashboardAnalytics();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// TAB 8: DISPATCHES
async function loadDispatchesTable() {
  const tbody = document.getElementById('dispatches-table-body');
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading dispatches...</td></tr>';

  try {
    const res = await apiRequest('/dispatches');
    const dispatches = res.dispatches || [];

    tbody.innerHTML = dispatches.map(d => {
      const statusBadge = d.status === 'DELIVERED'
        ? '<span class="badge badge-success">DELIVERED</span>'
        : d.status === 'IN_TRANSIT'
        ? '<span class="badge badge-info">IN TRANSIT</span>'
        : '<span class="badge badge-danger">MISMATCH</span>';

      const itemsStr = (d.items || []).map(i => `${i.commodity}: ${i.quantity}kg`).join(', ');

      return `
        <tr>
          <td><strong>${d.dispatchId}</strong></td>
          <td>${d.sourceWarehouseName || d.sourceWarehouseId}</td>
          <td>${d.destinationOfficeName || d.destinationOfficeId}</td>
          <td><code>${d.vehicleNumber}</code></td>
          <td><span style="font-size:0.82rem;">${itemsStr}</span></td>
          <td>${d.dispatchDate}</td>
          <td>${statusBadge}</td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="viewDispatchDetail('${d.dispatchId}')">Inspect</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" style="color:var(--red-primary);">Error: ${e.message}</td></tr>`;
  }
}

function openCreateDispatchModal() {
  document.getElementById('dispatch-items-container').innerHTML = '';
  addDispatchItemRow(); // Add first row
  openModal('modal-create-dispatch');
}

let dispatchRowCounter = 0;
function addDispatchItemRow() {
  const container = document.getElementById('dispatch-items-container');
  const rowId = `disp-row-${dispatchRowCounter++}`;

  const row = document.createElement('div');
  row.id = rowId;
  row.style.cssText = 'display:grid; grid-template-columns:1fr 1fr 1fr auto; gap:10px; margin-bottom:10px; align-items:center;';

  const batchOptions = cachedBatches.map(b => `
    <option value="${b.batchId}" data-comm="${b.commodityName}">
      ${b.batchId} (${b.commodityName} - Avail: ${b.availableQuantity}kg)
    </option>
  `).join('');

  row.innerHTML = `
    <div>
      <select class="form-control form-control-sm dsp-item-batch" onchange="syncDispatchCommodity('${rowId}')">
        ${batchOptions}
      </select>
    </div>
    <div>
      <input type="text" class="form-control form-control-sm dsp-item-comm" readonly value="${cachedBatches[0]?.commodityName || 'Rice'}">
    </div>
    <div>
      <input type="number" class="form-control form-control-sm dsp-item-qty" placeholder="Quantity (KG)" min="1" required>
    </div>
    <div>
      <button type="button" class="btn btn-outline btn-sm" style="color:var(--red-primary);" onclick="document.getElementById('${rowId}').remove()">✕</button>
    </div>
  `;

  container.appendChild(row);
}

function syncDispatchCommodity(rowId) {
  const row = document.getElementById(rowId);
  if (!row) return;
  const select = row.querySelector('.dsp-item-batch');
  const selectedOpt = select.options[select.selectedIndex];
  const comm = selectedOpt.getAttribute('data-comm');
  row.querySelector('.dsp-item-comm').value = comm || 'Grain';
}

function populateDispatchBatchOptions() {
  // Re-sync options if warehouse changes
}

async function handleCreateDispatch(e) {
  e.preventDefault();

  const items = [];
  const rows = document.querySelectorAll('#dispatch-items-container > div');
  rows.forEach(r => {
    const batchSelect = r.querySelector('.dsp-item-batch');
    const commInput = r.querySelector('.dsp-item-comm');
    const qtyInput = r.querySelector('.dsp-item-qty');

    if (batchSelect && qtyInput && qtyInput.value) {
      items.push({
        commodity: commInput.value,
        batchId: batchSelect.value,
        quantity: Number(qtyInput.value),
        unit: 'KG'
      });
    }
  });

  if (items.length === 0) {
    showToast('Please add at least 1 commodity item to dispatch.', 'warning');
    return;
  }

  const payload = {
    sourceWarehouseId: document.getElementById('dsp-source').value,
    destinationOfficeId: document.getElementById('dsp-dest').value,
    vehicleNumber: document.getElementById('dsp-vehicle').value.trim(),
    driverDetails: document.getElementById('dsp-driver').value.trim(),
    dispatchDate: new Date().toISOString().slice(0, 10),
    items
  };

  try {
    const res = await apiRequest('/dispatches', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showToast(res.message, 'success');
    closeModal('modal-create-dispatch');
    loadDispatchesTable();
    loadDashboardAnalytics();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function viewDispatchDetail(dispatchId) {
  try {
    const res = await apiRequest(`/dispatches/${dispatchId}`);
    const d = res.dispatch;

    let itemsHtml = (d.items || []).map(i => `
      <li>${i.commodity} (Batch: <code>${i.batchId}</code>): <strong>${i.quantity} ${i.unit}</strong></li>
    `).join('');

    alert(`
=== DISPATCH DETAILS: ${d.dispatchId} ===
Status: ${d.status}
Source: ${d.sourceWarehouseName}
Destination: ${d.destinationOfficeName}
Vehicle: ${d.vehicleNumber}
Driver: ${d.driverDetails}
Dispatched Date: ${d.dispatchDate}

ITEMS:
${itemsHtml.replace(/<[^>]+>/g, '')}
    `);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// TAB 9: BENEFICIARY DISTRIBUTIONS
async function loadDistributionsTable() {
  const tbody = document.getElementById('distributions-table-body');
  tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Loading distributions...</td></tr>';

  try {
    const res = await apiRequest('/distribution/history');
    const distributions = res.distributions || [];

    tbody.innerHTML = distributions.map(d => {
      const itemsStr = (d.items || []).map(i => `${i.commodity}: ${i.quantity}${i.unit || 'kg'}`).join(', ');
      return `
        <tr>
          <td><strong>${d.receiptNumber}</strong></td>
          <td>${d.beneficiaryName}</td>
          <td>${d.customerId}</td>
          <td>${d.rationCardNumber}</td>
          <td><code>${d.officeId}</code></td>
          <td>${itemsStr}</td>
          <td><span style="font-family:var(--font-mono); font-size:0.75rem;">${d.biometricVerificationRef || 'VERIFIED'}</span></td>
          <td>${d.timestamp?.slice(0, 19).replace('T', ' ')}</td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="printReceipt(${JSON.stringify(d).replace(/"/g, '&quot;')})">Receipt</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="9" style="color:var(--red-primary);">Error: ${e.message}</td></tr>`;
  }
}

// TAB 10: BLOCKCHAIN
async function loadBlockchainTab() {
  try {
    const [statsRes, txRes] = await Promise.all([
      apiRequest('/blockchain/stats'),
      apiRequest('/blockchain/transactions?limit=25')
    ]);

    document.getElementById('bc-block-height').textContent = `#${statsRes.stats.currentBlockHeight}`;

    const tbody = document.getElementById('bc-transactions-body');
    const txs = txRes.transactions || [];

    tbody.innerHTML = txs.map(t => `
      <tr>
        <td><strong>#${t.blockNumber}</strong></td>
        <td><code title="${t.txId}">${t.txId.substring(0, 18)}...</code></td>
        <td><span class="badge badge-navy">${t.action}</span></td>
        <td>${t.submittedBy || 'SYSTEM'}</td>
        <td><span class="badge ${t.status === 'COMMITTED_LEDGER' ? 'badge-success' : 'badge-warning'}">${t.status}</span></td>
        <td>${t.timestamp?.slice(0, 19).replace('T', ' ')}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="verifyBlockchainTx('${t.txId}')">Verify</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('Blockchain tab error:', e);
  }
}

async function traceBatchProvenance() {
  const batchId = document.getElementById('bc-trace-batch-input').value.trim();
  const resultDiv = document.getElementById('bc-timeline-result');
  if (!batchId) return;

  resultDiv.innerHTML = '<p>Tracing provenance across Hyperledger Fabric ledger...</p>';

  try {
    const res = await apiRequest(`/blockchain/batch/${encodeURIComponent(batchId)}`);
    const timeline = res.timeline || [];

    if (timeline.length === 0) {
      resultDiv.innerHTML = `<p style="color:var(--red-primary);">No ledger events found for Batch ${batchId}.</p>`;
      return;
    }

    const stepsHtml = timeline.map((step, idx) => `
      <div class="timeline-step verified">
        <div class="timeline-badge">${idx + 1}</div>
        <div class="timeline-content">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h4>${step.title}</h4>
            <span class="badge badge-success">BLOCK #${step.blockNumber}</span>
          </div>
          <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:6px;">
            <strong>Actor:</strong> ${step.actor} | <strong>Location:</strong> ${step.location}
          </div>
          <div style="font-size:0.75rem; font-family:var(--font-mono); color:var(--navy-primary); word-break:break-all;">
            Tx Hash: ${step.txId} | Date: ${step.timestamp?.slice(0, 19).replace('T', ' ')}
          </div>
        </div>
      </div>
    `).join('');

    resultDiv.innerHTML = `
      <div class="timeline">
        ${stepsHtml}
      </div>
    `;
  } catch (e) {
    resultDiv.innerHTML = `<p style="color:var(--red-primary);">Error: ${e.message}</p>`;
  }
}

async function verifyBlockchainTx(txId) {
  try {
    const res = await apiRequest(`/blockchain/verify/${encodeURIComponent(txId)}`);
    const v = res.verification;
    if (v.isValid) {
      alert(`
=== BLOCKCHAIN CRYPTOGRAPHIC VERIFICATION: PASSED ===
Tx Hash: ${v.txId}
Block Number: #${v.blockNumber}
Block Hash: ${v.blockHash}
Merkle Root: ${v.merkleRoot}
Block SHA-256 Integrity: PASSED
Chain Continuity: VERIFIED
Status: ${v.status}
      `);
    } else {
      alert(`Verification result: ${v.message || 'Block verification failed.'}`);
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// TAB 11: REPORTS EXPORT
async function exportReport(type) {
  try {
    const res = await apiRequest(`/reports/export/${type}`);
    const printWindow = window.open('', '_blank', 'width=900,height=800');

    const headers = Object.keys(res.data[0] || {});
    const headersHtml = headers.map(h => `<th style="border:1px solid #333; padding:6px 10px; background:#f0f0f0;">${h}</th>`).join('');

    const rowsHtml = res.data.map(row => `
      <tr>
        ${headers.map(h => `<td style="border:1px solid #ddd; padding:6px 10px; font-size:0.82rem;">${row[h]}</td>`).join('')}
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${res.reportTitle}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
          .header { text-align: center; border-bottom: 2px solid #0A2540; padding-bottom: 12px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          .btn-print { background: #0A2540; color: white; padding: 8px 16px; border: none; cursor: pointer; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2 style="margin:0; color:#0A2540;">GOVERNMENT OF INDIA - SMART PUBLIC DISTRIBUTION SYSTEM</h2>
          <h3 style="margin:6px 0; color:#333;">${res.reportTitle}</h3>
          <p style="font-size:0.85rem; color:#666; margin:0;">Generated on: ${new Date(res.generatedAt).toLocaleString()} | Records: ${res.recordCount}</p>
        </div>
        <table>
          <thead><tr>${headersHtml}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div style="margin-top:24px; text-align:center;">
          <button class="btn-print" onclick="window.print()">Print Official Report</button>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
  } catch (e) {
    showToast(`Export error: ${e.message}`, 'error');
  }
}

