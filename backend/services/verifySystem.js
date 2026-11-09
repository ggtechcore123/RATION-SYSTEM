const assert = require('assert');
const blockchainService = require('./blockchainService');
const { entitlementService } = require('./entitlementService');
const iotService = require('./iotService');
const { db } = require('../config/firebase');

async function testFullSystem() {
  console.log('🧪 Starting Full System Verification Test Suite...');

  // 1. Verify Database & Seed
  const custSnap = await db.collection('customers').get();
  console.log(`✓ Database check: ${custSnap.docs.length} customers registered.`);
  assert(custSnap.docs.length >= 3, 'Must have at least 3 seeded customers');

  // 2. Test Blockchain Ledger & All Chaincode Functions
  console.log('✓ Testing Hyperledger Fabric blockchain engine...');
  const stats = blockchainService.getStats();
  console.log(`  - Block Height: #${stats.currentBlockHeight}, Total Transactions: ${stats.totalTransactions}`);
  assert(stats.totalTransactions >= 4, 'Blockchain must have genesis and seeded transactions');

  // Test registerBatch
  const testBatch = {
    batchId: 'BATCH-TEST-2025-99',
    commodityId: 'COMM-RICE',
    commodityName: 'Rice',
    quantity: 1000,
    unit: 'KG',
    procurementDate: '2025-11-09',
    warehouseId: 'WH-C01',
    supplier: 'Test Farmer Mandi'
  };
  const batchReceipt = await blockchainService.registerBatch(testBatch);
  console.log(`✓ Blockchain registerBatch successful: Block #${batchReceipt.blockNumber}, Tx: ${batchReceipt.txId.substring(0, 16)}...`);

  // Test verifyTransaction
  const verifyRes = blockchainService.verifyTransaction(batchReceipt.txId);
  assert(verifyRes.isValid === true, 'Blockchain cryptographic block integrity must pass');
  console.log(`✓ Blockchain verifyTransaction: PASSED (SHA-256 block hash & chain continuity verified).`);

  // Test Batch Provenance Timeline
  const prov = blockchainService.getBatchHistory('BATCH-RICE-2025-01');
  assert(prov.length >= 1, 'Batch history must trace provenance');
  console.log(`✓ Batch provenance timeline for BATCH-RICE-2025-01: ${prov.length} supply chain events traced.`);

  // 3. Test IoT Biometric Service
  console.log('✓ Testing IoT & Biometric verification service...');
  const enrollSession = iotService.startEnrollment('CUST-TEST-01', 'head');
  assert(enrollSession.sessionId, 'Enrollment session created');
  const stepRes = iotService.processEnrollmentStep(enrollSession.sessionId, 'SUCCESS');
  assert(stepRes.session.templateRef, 'Template reference generated');
  console.log(`  - Biometric template enrolled: ${stepRes.session.templateRef}`);

  // Test verification for customer
  const authRes = await iotService.verifyBiometricLogin({
    customerIdOrRationCard: 'CUST-TN-2025-001',
    templateRef: 'FP-REF-GOWTHAM01',
    officeId: 'OFF001'
  });
  assert(authRes.verified === true, 'Biometric login for Gowtham must succeed');
  console.log(`✓ Biometric authentication: CUSTOMER VERIFIED (${authRes.customer.fullName})`);

  // Test verification failure for unregistered template
  const failRes = await iotService.verifyBiometricLogin({
    customerIdOrRationCard: 'CUST-TN-2025-001',
    templateRef: 'INVALID_UNKNOWN_FP_REF',
    officeId: 'OFF001'
  });
  assert(failRes.verified === false, 'Biometric login for invalid template must fail');
  console.log(`✓ Biometric mismatch rejection: AUTHENTICATION FAILED (Expected behavior verified).`);

  // 4. Test Family Entitlement Calculation
  console.log('✓ Testing NFSA Family Entitlement Calculation...');
  const customerDoc = await db.collection('customers').doc('CUST-TN-2025-001').get();
  const entSummary = await entitlementService.getBeneficiaryEntitlementSummary(customerDoc.data());
  console.log(`  - Category: ${entSummary.categoryName}, Active Members: ${entSummary.activeMembersCount}`);
  entSummary.items.forEach(i => {
    console.log(`    * ${i.name}: Quota = ${i.monthlyEntitlement}${i.unit}, Remaining = ${i.remaining}${i.unit}`);
  });
  assert(entSummary.items.length >= 4, 'Must have at least 4 commodities in entitlement schedule');

  console.log('\n🎉 ALL 4 CORE SYSTEM ENGINES VERIFIED 100% OPERATIONAL!');
}

testFullSystem().then(() => process.exit(0)).catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

