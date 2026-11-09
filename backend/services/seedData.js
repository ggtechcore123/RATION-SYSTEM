const bcrypt = require('bcryptjs');
const { db } = require('../config/firebase');
const blockchainService = require('./blockchainService');

async function seedInitialData() {
  console.log('🌱 Starting Smart PDS Database & Blockchain Seeding...');

  // 1. Admin Account
  const adminSalt = await bcrypt.genSalt(10);
  const adminHashedPassword = await bcrypt.hash('AdminPassword123!', adminSalt);
  await db.collection('users').doc('admin_master').set({
    uid: 'admin_master',
    username: 'admin',
    email: 'admin@pds.gov.in',
    passwordHash: adminHashedPassword,
    role: 'admin',
    name: 'National PDS Chief Administrator',
    createdAt: new Date().toISOString()
  });

  // 2. Warehouses
  const warehouses = [
    {
      id: 'WH-C01',
      name: 'Central Warehouse - Food Corporation of India (FCI) Chennai',
      type: 'CENTRAL',
      state: 'Tamil Nadu',
      district: 'Chennai',
      capacityTons: 10000,
      currentStockTons: 6420,
      contactPerson: 'K. Balachandran (Depot Manager)',
      phone: '044-28334411',
      address: 'Harbour Estate Godowns, Rajaji Salai, Chennai 600001',
      status: 'ACTIVE'
    },
    {
      id: 'WH-S01',
      name: 'State Buffer Warehouse - TNCSC Madurai',
      type: 'STATE',
      state: 'Tamil Nadu',
      district: 'Madurai',
      capacityTons: 5000,
      currentStockTons: 3200,
      contactPerson: 'S. Selvaraj',
      phone: '0452-2533881',
      address: 'Industrial Estate, Kappalur, Madurai 625008',
      status: 'ACTIVE'
    },
    {
      id: 'WH-D01',
      name: 'District Godown - Coimbatore Civil Supplies',
      type: 'DISTRICT',
      state: 'Tamil Nadu',
      district: 'Coimbatore',
      capacityTons: 2500,
      currentStockTons: 1450,
      contactPerson: 'V. Sundaram',
      phone: '0422-2499101',
      address: 'Goods Shed Road, Coimbatore 641018',
      status: 'ACTIVE'
    }
  ];

  for (const wh of warehouses) {
    await db.collection('warehouses').doc(wh.id).set(wh);
  }

  // 3. Ration Offices
  const offices = [
    {
      id: 'OFF001',
      officeName: 'Chennai Central Fair Price Ration Shop #01',
      state: 'Tamil Nadu',
      district: 'Chennai',
      taluk: 'Tambaram',
      village: 'Tambaram West',
      pincode: '600045',
      address: '14, Gandhi Road, Opp. Bus Terminus, Tambaram West, Chennai',
      contactNumber: '044-22261900',
      assignedOfficerId: 'OFFICER001',
      assignedOfficerName: 'Raj Kumar',
      status: 'ACTIVE',
      totalRegisteredBeneficiaries: 1420,
      createdAt: new Date().toISOString()
    },
    {
      id: 'OFF002',
      officeName: 'Madurai South Fair Price Shop #18',
      state: 'Tamil Nadu',
      district: 'Madurai',
      taluk: 'Madurai South',
      village: 'Villapuram',
      pincode: '625012',
      address: '88, Meenakshi Nagar Main Road, Madurai',
      contactNumber: '0452-2670119',
      assignedOfficerId: 'OFFICER002',
      assignedOfficerName: 'Priya Sharma',
      status: 'ACTIVE',
      totalRegisteredBeneficiaries: 980,
      createdAt: new Date().toISOString()
    },
    {
      id: 'OFF003',
      officeName: 'Coimbatore North FPS #07',
      state: 'Tamil Nadu',
      district: 'Coimbatore',
      taluk: 'Coimbatore North',
      village: 'RS Puram',
      pincode: '641002',
      address: '32, DB Road, RS Puram, Coimbatore',
      contactNumber: '0422-2550912',
      assignedOfficerId: null,
      status: 'ACTIVE',
      totalRegisteredBeneficiaries: 1150,
      createdAt: new Date().toISOString()
    }
  ];

  for (const off of offices) {
    off.officeId = off.officeId || off.id;
    await db.collection('offices').doc(off.id).set(off);
  }

  // 4. Officers
  const officerSalt = await bcrypt.genSalt(10);
  const officerHashedPassword = await bcrypt.hash('Password123!', officerSalt);

  const officers = [
    {
      id: 'OFFICER001',
      officerId: 'OFFICER001',
      name: 'Raj Kumar',
      username: 'raj001',
      passwordHash: officerHashedPassword,
      mobileNumber: '+91 98401 22334',
      assignedOfficeId: 'OFF001',
      assignedOfficeName: 'Chennai Central Fair Price Ration Shop #01',
      officeLocation: 'Tambaram, Chennai',
      role: 'OFFICER',
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    },
    {
      id: 'OFFICER002',
      officerId: 'OFFICER002',
      name: 'Priya Sharma',
      username: 'priya002',
      passwordHash: officerHashedPassword,
      mobileNumber: '+91 98402 33445',
      assignedOfficeId: 'OFF002',
      assignedOfficeName: 'Madurai South Fair Price Shop #18',
      officeLocation: 'Villapuram, Madurai',
      role: 'OFFICER',
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    }
  ];

  for (const offr of officers) {
    await db.collection('officers').doc(offr.id).set(offr);
    // Also save login record
    await db.collection('users').doc(offr.id).set({
      uid: offr.id,
      username: offr.username,
      name: offr.name,
      passwordHash: offr.passwordHash,
      role: 'officer',
      assignedOfficeId: offr.assignedOfficeId,
      createdAt: offr.createdAt
    });
  }

  // 5. Commodities
  const commodities = [
    { id: 'COMM-RICE', name: 'Rice (Common & Grade A)', code: 'RICE', unit: 'KG', defaultPricePerKg: 0 },
    { id: 'COMM-WHEAT', name: 'Wheat (Whole Grain)', code: 'WHEAT', unit: 'KG', defaultPricePerKg: 0 },
    { id: 'COMM-SUGAR', name: 'Refined Sugar', code: 'SUGAR', unit: 'KG', defaultPricePerKg: 13.5 },
    { id: 'COMM-DAL', name: 'Toor Dal (Fortified)', code: 'DAL', unit: 'KG', defaultPricePerKg: 30 }
  ];

  for (const c of commodities) {
    await db.collection('commodities').doc(c.id).set(c);
  }

  // 6. Stock Batches & Procurement Blockchain Records
  const stockBatches = [
    {
      batchId: 'BATCH-RICE-2025-01',
      commodityId: 'COMM-RICE',
      commodityName: 'Rice',
      warehouseId: 'WH-C01',
      quantity: 50000,
      availableQuantity: 44000,
      unit: 'KG',
      procurementDate: '2025-10-15',
      supplier: 'Punjab Agro Mandi Board & FCI Procurements',
      expiryDate: '2026-10-15',
      status: 'ACTIVE'
    },
    {
      batchId: 'BATCH-WHEAT-2025-01',
      commodityId: 'COMM-WHEAT',
      commodityName: 'Wheat',
      warehouseId: 'WH-C01',
      quantity: 30000,
      availableQuantity: 27500,
      unit: 'KG',
      procurementDate: '2025-10-18',
      supplier: 'Madhya Pradesh State Civil Supplies',
      expiryDate: '2026-10-18',
      status: 'ACTIVE'
    },
    {
      batchId: 'BATCH-SUGAR-2025-01',
      commodityId: 'COMM-SUGAR',
      commodityName: 'Sugar',
      warehouseId: 'WH-C01',
      quantity: 10000,
      availableQuantity: 9100,
      unit: 'KG',
      procurementDate: '2025-10-20',
      supplier: 'National Federation of Cooperative Sugar Factories',
      expiryDate: '2026-04-20',
      status: 'ACTIVE'
    },
    {
      batchId: 'BATCH-DAL-2025-01',
      commodityId: 'COMM-DAL',
      commodityName: 'Dal',
      warehouseId: 'WH-C01',
      quantity: 8000,
      availableQuantity: 7300,
      unit: 'KG',
      procurementDate: '2025-10-22',
      supplier: 'NAFED Pulse Procurement Drive',
      expiryDate: '2026-10-22',
      status: 'ACTIVE'
    }
  ];

  for (const batch of stockBatches) {
    await db.collection('stockBatches').doc(batch.batchId).set(batch);
    // Record to Blockchain
    await blockchainService.registerProcurement({
      procurementId: 'PROC-' + batch.batchId,
      batchId: batch.batchId,
      commodity: batch.commodityName,
      quantity: batch.quantity,
      unit: batch.unit,
      mandiSource: batch.supplier,
      warehouseId: batch.warehouseId
    });
  }

  // 7. Office Inventories
  const officeInventories = {
    OFF001: {
      rice: 2500,
      wheat: 1200,
      sugar: 450,
      dal: 350
    },
    OFF002: {
      rice: 1800,
      wheat: 900,
      sugar: 300,
      dal: 220
    },
    OFF003: {
      rice: 1200,
      wheat: 600,
      sugar: 200,
      dal: 180
    }
  };

  for (const [offId, inv] of Object.entries(officeInventories)) {
    await db.collection('officeInventory').doc(offId).set({
      officeId: offId,
      inventory: inv,
      lastUpdated: new Date().toISOString()
    });
  }

  // 8. Sample Dispatches
  const dispatches = [
    {
      id: 'DSP-2025-001',
      dispatchId: 'DSP-2025-001',
      sourceWarehouseId: 'WH-C01',
      sourceWarehouseName: 'Central Warehouse FCI Chennai',
      destinationOfficeId: 'OFF001',
      destinationOfficeName: 'Chennai Central Fair Price Ration Shop #01',
      vehicleNumber: 'TN-01-AG-4421',
      driverDetails: 'M. Shanmugam (DL: TN0120110049219, Mob: 9444102911)',
      dispatchDate: '2025-11-01',
      expectedDeliveryDate: '2025-11-02',
      status: 'DELIVERED', // DELIVERED, IN_TRANSIT, MISMATCH
      remarks: 'Monthly quota allocation tranche 1',
      items: [
        { commodity: 'Rice', batchId: 'BATCH-RICE-2025-01', quantity: 2000, unit: 'KG' },
        { commodity: 'Wheat', batchId: 'BATCH-WHEAT-2025-01', quantity: 1000, unit: 'KG' },
        { commodity: 'Sugar', batchId: 'BATCH-SUGAR-2025-01', quantity: 500, unit: 'KG' }
      ],
      createdAt: '2025-11-01T08:00:00Z',
      deliveredAt: '2025-11-02T10:30:00Z',
      confirmedBy: 'OFFICER001',
      discrepancy: false
    },
    {
      id: 'DSP-2025-002',
      dispatchId: 'DSP-2025-002',
      sourceWarehouseId: 'WH-C01',
      sourceWarehouseName: 'Central Warehouse FCI Chennai',
      destinationOfficeId: 'OFF001',
      destinationOfficeName: 'Chennai Central Fair Price Ration Shop #01',
      vehicleNumber: 'TN-22-CX-7788',
      driverDetails: 'K. Parthiban (Mob: 9884019283)',
      dispatchDate: new Date().toISOString().slice(0, 10),
      expectedDeliveryDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      status: 'IN_TRANSIT',
      remarks: 'Supplemental mid-month buffer tranche',
      items: [
        { commodity: 'Rice', batchId: 'BATCH-RICE-2025-01', quantity: 1000, unit: 'KG' },
        { commodity: 'Dal', batchId: 'BATCH-DAL-2025-01', quantity: 300, unit: 'KG' }
      ],
      createdAt: new Date().toISOString()
    }
  ];

  for (const d of dispatches) {
    await db.collection('dispatches').doc(d.id).set(d);
    // Record dispatch to blockchain
    await blockchainService.dispatchToOffice({
      dispatchId: d.dispatchId,
      sourceWarehouseId: d.sourceWarehouseId,
      destOfficeId: d.destinationOfficeId,
      items: d.items,
      vehicleNo: d.vehicleNumber,
      driverDetails: d.driverDetails
    });

    if (d.status === 'DELIVERED') {
      await blockchainService.confirmOfficeReceipt({
        dispatchId: d.dispatchId,
        officeId: d.destinationOfficeId,
        receivedItems: d.items,
        officerId: d.confirmedBy,
        discrepancy: false,
        difference: [],
        remarks: 'All items verified against physical weigh-bridge.'
      });
    }
  }

  // 9. Customers (Beneficiaries)
  const customers = [
    {
      id: 'CUST-TN-2025-001',
      customerId: 'CUST-TN-2025-001',
      fullName: 'Gowtham N K',
      dateOfBirth: '1998-04-12',
      gender: 'Male',
      mobileNumber: '+91 98401 99881',
      email: 'gowtham.beneficiary@gmail.com',
      address: '22, Anna Nagar 3rd Cross Street, Tambaram',
      state: 'Tamil Nadu',
      district: 'Chennai',
      taluk: 'Tambaram',
      village: 'Tambaram West',
      pincode: '600045',
      rationCardNumber: 'RC-TN-772819',
      rationCardCategory: 'PHH', // Priority Household
      familyHeadName: 'Gowtham N K',
      assignedOfficeId: 'OFF001',
      assignedOfficeName: 'Chennai Central Fair Price Ration Shop #01',
      status: 'APPROVED', // APPROVED, PENDING, REJECTED
      fingerprintRef: 'FP-REF-GOWTHAM01',
      fingerprintStatus: 'ENROLLED',
      familyMembers: [
        {
          memberId: 'MEM-01',
          fullName: 'K. Natesan',
          age: 58,
          gender: 'Male',
          relationship: 'Father',
          occupation: 'Retired',
          fingerprintRef: 'FP-REF-NATESAN01',
          fingerprintStatus: 'ENROLLED',
          status: 'ACTIVE'
        },
        {
          memberId: 'MEM-02',
          fullName: 'N. Kasthuri',
          age: 54,
          gender: 'Female',
          relationship: 'Mother',
          occupation: 'Homemaker',
          fingerprintRef: 'FP-REF-KASTHURI01',
          fingerprintStatus: 'ENROLLED',
          status: 'ACTIVE'
        },
        {
          memberId: 'MEM-03',
          fullName: 'N. Deepa',
          age: 24,
          gender: 'Female',
          relationship: 'Sister',
          occupation: 'Student',
          fingerprintRef: 'FP-REF-DEEPA01',
          fingerprintStatus: 'ENROLLED',
          status: 'ACTIVE'
        }
      ],
      documents: {
        rationCardDoc: '/assets/sample-docs/ration-card.pdf',
        addressProofDoc: '/assets/sample-docs/aadhaar-sample.pdf',
        identityProofDoc: '/assets/sample-docs/voter-sample.pdf'
      },
      createdAt: '2025-10-01T10:00:00Z',
      approvedAt: '2025-10-02T14:30:00Z',
      approvedBy: 'admin_master'
    },
    {
      id: 'CUST-TN-2025-002',
      customerId: 'CUST-TN-2025-002',
      fullName: 'Meenakshi Sundaram',
      dateOfBirth: '1975-06-21',
      gender: 'Female',
      mobileNumber: '+91 98402 77112',
      email: 'meenakshi.s@gmail.com',
      address: '15/A, Kamarajar Street, Tambaram',
      state: 'Tamil Nadu',
      district: 'Chennai',
      taluk: 'Tambaram',
      village: 'Tambaram West',
      pincode: '600045',
      rationCardNumber: 'RC-TN-992144',
      rationCardCategory: 'AAY', // Antyodaya Anna Yojana (Poorest)
      familyHeadName: 'Meenakshi Sundaram',
      assignedOfficeId: 'OFF001',
      assignedOfficeName: 'Chennai Central Fair Price Ration Shop #01',
      status: 'APPROVED',
      fingerprintRef: 'FP-REF-MEENAKSHI01',
      fingerprintStatus: 'ENROLLED',
      familyMembers: [
        {
          memberId: 'MEM-04',
          fullName: 'M. Senthil',
          age: 26,
          gender: 'Male',
          relationship: 'Son',
          occupation: 'Daily Wage Laborer',
          fingerprintRef: 'FP-REF-SENTHIL01',
          fingerprintStatus: 'ENROLLED',
          status: 'ACTIVE'
        },
        {
          memberId: 'MEM-05',
          fullName: 'M. Revathi',
          age: 22,
          gender: 'Female',
          relationship: 'Daughter',
          occupation: 'Unemployed',
          fingerprintRef: 'FP-REF-REVATHI01',
          fingerprintStatus: 'ENROLLED',
          status: 'ACTIVE'
        }
      ],
      documents: {
        rationCardDoc: '/assets/sample-docs/ration-card.pdf',
        addressProofDoc: '/assets/sample-docs/aadhaar-sample.pdf'
      },
      createdAt: '2025-10-05T11:20:00Z',
      approvedAt: '2025-10-06T09:15:00Z',
      approvedBy: 'admin_master'
    },
    {
      id: 'CUST-TN-2025-003',
      customerId: 'CUST-TN-2025-003',
      fullName: 'Ramesh Kumar',
      dateOfBirth: '1989-11-04',
      gender: 'Male',
      mobileNumber: '+91 97910 44332',
      email: 'ramesh.k@gmail.com',
      address: '42, Nehru Bazaar, Tambaram',
      state: 'Tamil Nadu',
      district: 'Chennai',
      taluk: 'Tambaram',
      village: 'Tambaram West',
      pincode: '600045',
      rationCardNumber: 'RC-TN-441209',
      rationCardCategory: 'PHH',
      familyHeadName: 'Ramesh Kumar',
      assignedOfficeId: 'OFF001',
      assignedOfficeName: 'Chennai Central Fair Price Ration Shop #01',
      status: 'PENDING',
      fingerprintRef: 'FP-REF-RAMESH01',
      fingerprintStatus: 'ENROLLED',
      familyMembers: [
        {
          memberId: 'MEM-06',
          fullName: 'Radhika Ramesh',
          age: 32,
          gender: 'Female',
          relationship: 'Spouse',
          occupation: 'Tailor',
          fingerprintRef: 'FP-REF-RADHIKA01',
          fingerprintStatus: 'ENROLLED',
          status: 'ACTIVE'
        }
      ],
      documents: {
        rationCardDoc: '/assets/sample-docs/ration-card.pdf',
        addressProofDoc: '/assets/sample-docs/aadhaar-sample.pdf'
      },
      createdAt: new Date().toISOString()
    }
  ];

  for (const cust of customers) {
    await db.collection('customers').doc(cust.id).set(cust);
    // User login record
    await db.collection('users').doc(cust.id).set({
      uid: cust.id,
      username: cust.customerId,
      name: cust.fullName,
      rationCardNumber: cust.rationCardNumber,
      role: 'customer',
      status: cust.status,
      assignedOfficeId: cust.assignedOfficeId,
      createdAt: cust.createdAt
    });
  }

  // 10. Sample Past Distributions
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const sampleDistribution = {
    id: 'DIST-2025-001',
    distributionId: 'DIST-2025-001',
    customerId: 'CUST-TN-2025-001',
    rationCardNumber: 'RC-TN-772819',
    category: 'PHH',
    beneficiaryName: 'Gowtham N K',
    monthKey: currentMonthKey,
    officeId: 'OFF001',
    officerId: 'OFFICER001',
    officerName: 'Raj Kumar',
    biometricVerificationRef: 'BIO-AUTH-SEED-VERIFIED-01',
    authenticatedMember: 'Gowtham N K (Head)',
    items: [
      { commodity: 'Rice', quantity: 10, unit: 'KG', price: 0 },
      { commodity: 'Wheat', quantity: 4, unit: 'KG', price: 0 },
      { commodity: 'Sugar', quantity: 1, unit: 'KG', price: 13.5 }
    ],
    totalAmountPaid: 13.5,
    timestamp: new Date().toISOString()
  };

  await db.collection('distributions').doc(sampleDistribution.id).set(sampleDistribution);

  // Record on blockchain
  await blockchainService.distributeRation({
    distributionId: sampleDistribution.distributionId,
    customerId: sampleDistribution.customerId,
    rationCardNumber: sampleDistribution.rationCardNumber,
    officeId: sampleDistribution.officeId,
    officerId: sampleDistribution.officerId,
    distributedItems: sampleDistribution.items,
    biometricVerificationRef: sampleDistribution.biometricVerificationRef,
    receiptNumber: 'RCP-2025-001'
  });

  console.log('✅ Seeding completed successfully! System is pre-populated with realistic government PDS data.');
}

if (require.main === module) {
  seedInitialData().then(() => process.exit(0)).catch(err => {
    console.error('Error in seeding:', err);
    process.exit(1);
  });
}

module.exports = seedInitialData;

