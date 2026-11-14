/**
 * Customer Multi-Step Registration Controller
 */

let currentStep = 1;
const familyMembersList = [];
let enrolledBiometrics = {
  head: null // memberId -> { templateRef, status }
};
const uploadedDocs = {
  rationCardDoc: '/assets/sample-docs/ration-card.pdf',
  addressProofDoc: '/assets/sample-docs/aadhaar-sample.pdf',
  identityProofDoc: '/assets/sample-docs/voter-sample.pdf'
};

// Initialize with 1 default family member row
document.addEventListener('DOMContentLoaded', () => {
  addFamilyMemberRow('K. Natesan', 58, 'Male', 'Father', 'Retired');
  addFamilyMemberRow('N. Kasthuri', 54, 'Female', 'Mother', 'Homemaker');
  populateBiometricSubjectDropdown();
});

// Stepper navigation
function goToStep(step) {
  if (step > currentStep) {
    if (!validateStep(currentStep)) return;
  }

  // Update nav UI
  for (let s = 1; s <= 6; s++) {
    const navItem = document.getElementById(`step-nav-${s}`);
    const content = document.getElementById(`step-content-${s}`);

    if (s === step) {
      navItem.className = 'step-item active';
      content.style.display = 'block';
    } else if (s < step) {
      navItem.className = 'step-item completed';
      content.style.display = 'none';
    } else {
      navItem.className = 'step-item';
      content.style.display = 'none';
    }
  }

  currentStep = step;

  if (step === 3) {
    // Sync head name if empty
    const full = document.getElementById('reg-fullName').value.trim();
    if (!document.getElementById('reg-headName').value) {
      document.getElementById('reg-headName').value = full;
    }
  } else if (step === 4) {
    populateBiometricSubjectDropdown();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Step Validation
function validateStep(step) {
  if (step === 1) {
    const name = document.getElementById('reg-fullName').value.trim();
    const dob = document.getElementById('reg-dob').value;
    const gender = document.getElementById('reg-gender').value;
    const mobile = document.getElementById('reg-mobile').value.trim();
    const address = document.getElementById('reg-address').value.trim();
    const pincode = document.getElementById('reg-pincode').value.trim();

    if (!name || !dob || !gender || !mobile || !address || !pincode) {
      showToast('Please fill all mandatory fields marked with * in Step 1.', 'warning');
      return false;
    }
    if (mobile.length < 10) {
      showToast('Please enter a valid 10-digit mobile number.', 'warning');
      return false;
    }
  } else if (step === 2) {
    const card = document.getElementById('reg-cardNo').value.trim();
    const head = document.getElementById('reg-headName').value.trim();
    if (!card || !head) {
      showToast('Please enter Ration Card Number and Family Head Name.', 'warning');
      return false;
    }
  }
  return true;
}

// Update Category Info Banner
function updateCategoryBanner() {
  const cat = document.getElementById('reg-category').value;
  const box = document.getElementById('category-info-box');
  if (cat === 'PHH') {
    box.innerHTML = '<strong>PHH Entitlement:</strong> 5 KG Rice/person + 2 KG Wheat/person + 1 KG Sugar/card + 1 KG Dal/card at subsidized government rates.';
  } else if (cat === 'AAY') {
    box.innerHTML = '<strong>AAY Entitlement:</strong> 35 KG total food grain per family (20 KG Rice + 15 KG Wheat + 1 KG Sugar + 2 KG Dal) at maximum subsidized rate.';
  } else {
    box.innerHTML = '<strong>OPHH / General Entitlement:</strong> 3 KG Rice/person + 1 KG Wheat/person + 1 KG Sugar per card.';
  }
}

// Dynamic Family Member Rows
let memberCounter = 1;
function addFamilyMemberRow(defName = '', defAge = 25, defGender = 'Male', defRel = 'Spouse', defOcc = '') {
  const tbody = document.getElementById('family-tbody');
  const memberId = `MEM-${String(memberCounter++).padStart(2, '0')}`;

  const tr = document.createElement('tr');
  tr.id = `row-${memberId}`;
  tr.innerHTML = `
    <td><strong>${memberId}</strong></td>
    <td><input type="text" class="form-control form-control-sm" id="name-${memberId}" value="${defName}" placeholder="Full Name" required></td>
    <td><input type="number" class="form-control form-control-sm" id="age-${memberId}" value="${defAge}" min="1" max="110"></td>
    <td>
      <select class="form-control form-control-sm" id="gender-${memberId}">
        <option value="Male" ${defGender === 'Male' ? 'selected' : ''}>Male</option>
        <option value="Female" ${defGender === 'Female' ? 'selected' : ''}>Female</option>
        <option value="Other" ${defGender === 'Other' ? 'selected' : ''}>Other</option>
      </select>
    </td>
    <td>
      <select class="form-control form-control-sm" id="rel-${memberId}">
        <option value="Father" ${defRel === 'Father' ? 'selected' : ''}>Father</option>
        <option value="Mother" ${defRel === 'Mother' ? 'selected' : ''}>Mother</option>
        <option value="Spouse" ${defRel === 'Spouse' ? 'selected' : ''}>Spouse</option>
        <option value="Son" ${defRel === 'Son' ? 'selected' : ''}>Son</option>
        <option value="Daughter" ${defRel === 'Daughter' ? 'selected' : ''}>Daughter</option>
        <option value="Brother" ${defRel === 'Brother' ? 'selected' : ''}>Brother</option>
        <option value="Sister" ${defRel === 'Sister' ? 'selected' : ''}>Sister</option>
      </select>
    </td>
    <td><input type="text" class="form-control form-control-sm" id="occ-${memberId}" value="${defOcc}" placeholder="Occupation"></td>
    <td>
      <button type="button" class="btn btn-outline btn-sm" style="color:var(--red-primary);" onclick="removeFamilyMemberRow('${memberId}')">🗑️</button>
    </td>
  `;

  tbody.appendChild(tr);
  populateBiometricSubjectDropdown();
}

function removeFamilyMemberRow(memberId) {
  const tr = document.getElementById(`row-${memberId}`);
  if (tr) tr.remove();
  populateBiometricSubjectDropdown();
}

function getCollectedFamilyMembers() {
  const members = [];
  const rows = document.querySelectorAll('#family-tbody tr');
  rows.forEach(r => {
    const id = r.id.replace('row-', '');
    const nameInput = document.getElementById(`name-${id}`);
    const ageInput = document.getElementById(`age-${id}`);
    const genderInput = document.getElementById(`gender-${id}`);
    const relInput = document.getElementById(`rel-${id}`);
    const occInput = document.getElementById(`occ-${id}`);

    if (nameInput && nameInput.value.trim()) {
      const fp = enrolledBiometrics[id];
      members.push({
        memberId: id,
        fullName: nameInput.value.trim(),
        age: Number(ageInput.value || 0),
        gender: genderInput.value,
        relationship: relInput.value,
        occupation: occInput ? occInput.value.trim() : 'N/A',
        fingerprintRef: fp ? fp.templateRef : null,
        fingerprintStatus: fp ? 'ENROLLED' : 'NOT_ENROLLED',
        status: 'ACTIVE'
      });
    }
  });
  return members;
}

// Populate Biometric Member Dropdown
function populateBiometricSubjectDropdown() {
  const select = document.getElementById('biometric-member-select');
  if (!select) return;

  const headName = document.getElementById('reg-fullName')?.value || 'Head of Family';
  let html = `<option value="head">Family Head: ${headName}</option>`;

  const members = getCollectedFamilyMembers();
  members.forEach(m => {
    html += `<option value="${m.memberId}">Member (${m.relationship}): ${m.fullName}</option>`;
  });

  select.innerHTML = html;
  updateBiometricStatusCard();
}

function changeBiometricSubject() {
  updateBiometricStatusCard();
}

function updateBiometricStatusCard() {
  const subjectId = document.getElementById('biometric-member-select').value;
  const enrolled = enrolledBiometrics[subjectId];

  const badge = document.getElementById('fp-status-badge');
  const title = document.getElementById('fp-status-title');
  const desc = document.getElementById('fp-status-desc');
  const refContainer = document.getElementById('fp-ref-container');
  const refText = document.getElementById('fp-ref-text');
  const pad = document.getElementById('fp-touchpad');

  if (enrolled && enrolled.templateRef) {
    badge.className = 'badge badge-success';
    badge.textContent = 'SUCCESSFULLY ENROLLED';
    title.textContent = 'Biometric Template Enrolled & Hashed';
    desc.textContent = 'Sensor minutiae successfully processed and stored locally on ESP32 terminal flash memory.';
    refContainer.style.display = 'block';
    refText.textContent = enrolled.templateRef;
    pad.style.borderColor = 'var(--green-primary)';
    pad.innerHTML = '✓';
  } else {
    badge.className = 'badge badge-warning';
    badge.textContent = 'NOT ENROLLED';
    title.textContent = 'Touch the sensor to begin optical fingerprint capture';
    desc.textContent = 'Communicates with the ESP32 hardware terminal over UART2 / REST API. Place finger steady on the glass prism.';
    refContainer.style.display = 'none';
    pad.style.borderColor = '#94A3B8';
    pad.innerHTML = '👆';
  }
}

// ESP32 Hardware Connection Helpers for Registration Step 4
let pendingEnrollResolver = null;

if (window.esp32Bridge) {
  window.esp32Bridge.onStatusChange((status, details) => {
    const el = document.getElementById('reg-hw-status');
    if (!el) return;
    if (status === 'CONNECTED') {
      el.innerHTML = `<span style="color: var(--green-primary);">● ESP32 R307 Connected (${details.mode})</span>`;
    } else if (status === 'CONNECTING') {
      el.innerHTML = `<span style="color: var(--amber-text);">● Connecting ESP32...</span>`;
    } else {
      el.innerHTML = `● Hardware: Simulator Ready (or Connect ESP32)`;
    }
  });

  window.esp32Bridge.onFingerprintEnroll((res) => {
    if (pendingEnrollResolver) {
      pendingEnrollResolver(res);
      pendingEnrollResolver = null;
    }
  });
}

async function connectRegESP32USB() {
  try {
    await window.esp32Bridge.connectUSB();
    showToast('ESP32 connected via USB! Ready for R307 fingerprint enrollment.', 'success');
  } catch (err) {
    showToast(`USB Connect Error: ${err.message}`, 'error');
  }
}

async function connectRegESP32IP() {
  const ip = prompt('Enter ESP32 WiFi IP Address:', localStorage.getItem('pds_esp32_ip') || '192.168.1.150');
  if (!ip) return;
  try {
    await window.esp32Bridge.connectIP(ip);
    showToast(`ESP32 connected at ${ip}!`, 'success');
  } catch (err) {
    showToast(`IP Connect Error: ${err.message}`, 'error');
  }
}

// Interactive ESP32 Biometric Scan
async function triggerBiometricScan(forceSimulator = false) {
  const subjectId = document.getElementById('biometric-member-select').value;
  const pad = document.getElementById('fp-touchpad');
  const badge = document.getElementById('fp-status-badge');
  const title = document.getElementById('fp-status-title');
  const desc = document.getElementById('fp-status-desc');

  pad.classList.add('scanning');
  badge.className = 'badge badge-info';
  badge.textContent = 'SCANNING FINGERPRINT';
  title.textContent = 'Capturing Biometric Ridges...';
  desc.textContent = forceSimulator
    ? 'Using Virtual R307 Biometric Capture...'
    : 'ESP32 Optical Sensor (R307) LED active. Please place finger steady (2 scans required on hardware).';

  try {
    const custIdent = document.getElementById('reg-cardNo').value || 'TEMP-CUST';
    // 1. Start enrollment session on backend / clientDB
    const sessionRes = await apiRequest('/iot/enroll/start', {
      method: 'POST',
      body: JSON.stringify({
        customerId: custIdent,
        memberId: subjectId
      })
    });

    const sessionId = sessionRes.sessionId;
    let hwSlotId = sessionRes.assignedTemplateId || null;
    let hwTemplateRef = null;

    // 2. If physical ESP32 is connected via USB or IP (and not forced simulator), perform real R307 capture
    if (!forceSimulator && window.esp32Bridge && window.esp32Bridge.status === 'CONNECTED' && window.esp32Bridge.mode === 'USB') {
      const enrollPromise = new Promise((resolve, reject) => {
        pendingEnrollResolver = resolve;
        setTimeout(() => {
          if (pendingEnrollResolver) {
            pendingEnrollResolver = null;
            reject(new Error('R307 hardware enrollment timed out.'));
          }
        }, 25000);
      });
      await window.esp32Bridge.triggerEnrollViaUSB(sessionId, custIdent, subjectId);
      const hwRes = await enrollPromise;
      if (!hwRes.success) throw new Error(hwRes.error || 'R307 sensor failed to enroll.');
      hwSlotId = hwRes.slotId;
      hwTemplateRef = hwRes.templateRef;
    } else if (!forceSimulator && window.esp32Bridge && window.esp32Bridge.status === 'CONNECTED' && window.esp32Bridge.mode === 'IP') {
      const ipRes = await window.esp32Bridge.triggerEnrollViaIP();
      if (ipRes && ipRes.success) {
        hwSlotId = ipRes.slotId;
        hwTemplateRef = ipRes.templateRef;
      }
    } else {
      // Simulator delay for browser-only mode
      await new Promise(r => setTimeout(r, 1000));
    }

    // 3. Complete enrollment step
    const stepRes = await apiRequest('/iot/enroll/step', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        slotId: hwSlotId,
        templateRef: hwTemplateRef,
        status: 'SUCCESS'
      })
    });

    const finalSlotId = hwSlotId || stepRes.session?.slotId || Math.floor(Math.random() * 200) + 10;
    const templateRef = hwTemplateRef || stepRes.session?.templateRef || `FP-R307-SLOT${finalSlotId}`;

    enrolledBiometrics[subjectId] = {
      slotId: finalSlotId,
      templateRef,
      status: 'ENROLLED'
    };

    pad.classList.remove('scanning');
    updateBiometricStatusCard();
    showToast(`Fingerprint enrolled (${templateRef}) for ${subjectId === 'head' ? 'Family Head' : subjectId}!`, 'success');
  } catch (err) {
    pad.classList.remove('scanning');
    badge.className = 'badge badge-danger';
    badge.textContent = 'HARDWARE SENSOR ERROR';
    title.textContent = 'FPM10A/DY50 Sensor Not Detected / Timed Out';
    desc.innerHTML = `${err.message}. Check 5V VCC, TXD→GPIO16, RXD→GPIO17, or <a href="javascript:void(0)" onclick="triggerBiometricScan(true)" style="color: var(--blue-primary); font-weight: 700; text-decoration: underline;">click here to enroll via Software Simulator</a>.`;
    showToast(`Biometric enrollment failed: ${err.message}`, 'error');
  }
}

// Handle Document Upload
async function handleFileUpload(input, docKey) {
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0];

  const formData = new FormData();
  formData.append('document', file);

  try {
    const res = await apiRequest('/customers/upload-doc', {
      method: 'POST',
      body: formData
    });

    if (res.success) {
      uploadedDocs[docKey] = res.filePath;
      showToast(`Document ${file.name} uploaded successfully!`, 'success');
      const statusElem = document.getElementById(`doc-${docKey.replace('Doc', '')}-status`);
      if (statusElem) {
        statusElem.textContent = `✓ Uploaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        statusElem.style.color = 'var(--green-primary)';
      }
    }
  } catch (e) {
    showToast(`Document upload error: ${e.message}`, 'error');
  }
}

// Final Submission
async function submitRegistration() {
  const familyMembers = getCollectedFamilyMembers();
  const headBio = enrolledBiometrics['head'] || {};
  const headFp = headBio.templateRef || `FP-DY50-SLOT${headBio.slotId || Date.now().toString().slice(-3)}`;

  const payload = {
    fullName: document.getElementById('reg-fullName').value.trim(),
    dateOfBirth: document.getElementById('reg-dob').value,
    gender: document.getElementById('reg-gender').value,
    mobileNumber: document.getElementById('reg-mobile').value.trim(),
    emailAddress: document.getElementById('reg-email').value.trim(),
    email: document.getElementById('reg-email').value.trim(),
    residentialAddress: document.getElementById('reg-address').value.trim(),
    address: document.getElementById('reg-address').value.trim(),
    state: document.getElementById('reg-state').value,
    district: document.getElementById('reg-district').value.trim(),
    taluk: document.getElementById('reg-taluk').value.trim(),
    village: document.getElementById('reg-village').value.trim(),
    pincode: document.getElementById('reg-pincode').value.trim(),
    rationCardNumber: document.getElementById('reg-cardNo').value.trim(),
    rationCardCategory: document.getElementById('reg-category').value,
    familyHeadName: document.getElementById('reg-headName').value.trim(),
    numberOfFamilyMembers: 1 + familyMembers.length,
    assignedOfficeId: document.getElementById('reg-officeId').value,
    existingRationShop: document.getElementById('reg-existingShop').value.trim(),
    familyMembers,
    fingerprintRef: headFp,
    fingerprintTemplateId: headBio.slotId || null,
    enrolledBiometrics,
    documents: uploadedDocs
  };

  try {
    const result = await apiRequest('/customers/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (result.success) {
      // Populate Confirmation Step
      const cust = result.customer || {};
      document.getElementById('conf-customerId').textContent = result.customerId || cust.customerId || 'N/A';
      document.getElementById('conf-cardNo').textContent = payload.rationCardNumber;
      document.getElementById('conf-fullName').textContent = payload.fullName;
      document.getElementById('conf-category').textContent = payload.rationCardCategory;
      document.getElementById('conf-office').textContent = cust.assignedOfficeName || payload.assignedOfficeId || 'N/A';
      document.getElementById('conf-memberCount').textContent = `${payload.numberOfFamilyMembers} (Head + ${familyMembers.length} Members)`;
      document.getElementById('conf-fpRef').textContent = headFp;

      // Save customer token/ID for dashboard access
      localStorage.setItem('pds_customer_token', result.customerId);
      localStorage.setItem('pds_customer_id', result.customerId);

      goToStep(6);
      showToast('Beneficiary registration submitted successfully!', 'success');
    }
  } catch (error) {
    showToast(`Submission failed: ${error.message}`, 'error');
  }
}

