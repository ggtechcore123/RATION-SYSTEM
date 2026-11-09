const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const LEDGER_PATH = path.join(__dirname, '..', 'data', 'blockchain_ledger.json');

class BlockchainLedger {
  constructor() {
    this.chain = [];
    this.pendingTransactions = [];
    this.fabricConnected = false;
    this.loadLedger();
  }

  loadLedger() {
    try {
      const dir = path.dirname(LEDGER_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(LEDGER_PATH)) {
        const raw = fs.readFileSync(LEDGER_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        this.chain = parsed.chain || [];
      }

      if (this.chain.length === 0) {
        this.createGenesisBlock();
      }
    } catch (err) {
      console.warn('Initializing new ledger, error loading:', err.message);
      this.createGenesisBlock();
    }
  }

  saveLedger() {
    try {
      const dir = path.dirname(LEDGER_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        LEDGER_PATH,
        JSON.stringify({ chain: this.chain, lastUpdated: new Date().toISOString() }, null, 2),
        'utf8'
      );
    } catch (err) {
      console.error('Error saving blockchain ledger:', err.message);
    }
  }

  createGenesisBlock() {
    const genesisTx = {
      txId: '0xGENESIS00000000000000000000000000000000000000000000000000000000',
      action: 'GENESIS_INIT',
      payload: {
        network: 'Indian Public Distribution System (PDS) Hyperledger Fabric Channel',
        authority: 'Ministry of Consumer Affairs, Food & Public Distribution',
        timestamp: new Date().toISOString(),
        version: '1.0.0-PROD'
      },
      status: 'COMMITTED_LEDGER',
      timestamp: new Date().toISOString()
    };

    const genesisBlock = {
      blockNumber: 0,
      timestamp: new Date().toISOString(),
      previousHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactions: [genesisTx],
      merkleRoot: this.calculateMerkleRoot([genesisTx]),
      nonce: 100,
      hash: ''
    };
    genesisBlock.hash = this.calculateBlockHash(genesisBlock);
    this.chain = [genesisBlock];
    this.saveLedger();
  }

  calculateMerkleRoot(transactions) {
    if (!transactions || transactions.length === 0) return '0x0';
    let hashes = transactions.map(tx =>
      crypto.createHash('sha256').update(JSON.stringify(tx)).digest('hex')
    );
    while (hashes.length > 1) {
      if (hashes.length % 2 !== 0) {
        hashes.push(hashes[hashes.length - 1]);
      }
      const newLevel = [];
      for (let i = 0; i < hashes.length; i += 2) {
        const combined = crypto
          .createHash('sha256')
          .update(hashes[i] + hashes[i + 1])
          .digest('hex');
        newLevel.push(combined);
      }
      hashes = newLevel;
    }
    return '0x' + hashes[0];
  }

  calculateBlockHash(block) {
    const header = `${block.blockNumber}-${block.timestamp}-${block.previousHash}-${block.merkleRoot}-${block.nonce}`;
    return '0x' + crypto.createHash('sha256').update(header).digest('hex');
  }

  isFabricActive() {
    return process.env.FABRIC_ENABLED === 'true' && this.fabricConnected;
  }

  generateTxHash(payload) {
    const str = `${JSON.stringify(payload)}-${Date.now()}-${uuidv4()}`;
    return '0x' + crypto.createHash('sha256').update(str).digest('hex');
  }

  async recordTransaction(action, payload) {
    const isFabricLive = this.isFabricActive();
    const status = isFabricLive ? 'COMMITTED_LEDGER' : 'PENDING_BLOCKCHAIN';
    const txId = this.generateTxHash(payload);

    // Keep beneficiary personal details and fingerprint information off-chain
    const sanitizedPayload = { ...payload };
    delete sanitizedPayload.customerFullName;
    delete sanitizedPayload.mobileNumber;
    delete sanitizedPayload.biometricTemplate;
    delete sanitizedPayload.address;

    const tx = {
      txId,
      action,
      payload: sanitizedPayload,
      channel: 'pdschannel',
      chaincode: 'smartpds',
      status, // PENDING_BLOCKCHAIN if fabric network is not live, COMMITTED_LEDGER if fabric commits
      timestamp: new Date().toISOString(),
      submittedBy: payload.officerId || payload.adminId || 'SYSTEM_NODE'
    };

    const latestBlock = this.chain[this.chain.length - 1];
    const newBlockNumber = latestBlock.blockNumber + 1;

    const newBlock = {
      blockNumber: newBlockNumber,
      timestamp: new Date().toISOString(),
      previousHash: latestBlock.hash,
      transactions: [tx],
      merkleRoot: this.calculateMerkleRoot([tx]),
      nonce: Math.floor(Math.random() * 100000),
      hash: ''
    };
    newBlock.hash = this.calculateBlockHash(newBlock);

    this.chain.push(newBlock);
    this.saveLedger();

    return {
      txId,
      blockNumber: newBlockNumber,
      blockHash: newBlock.hash,
      merkleRoot: newBlock.merkleRoot,
      status,
      timestamp: tx.timestamp
    };
  }

  // Chaincode 1: registerBatch
  async registerBatch(batchData) {
    return await this.recordTransaction('registerBatch', {
      batchId: batchData.batchId,
      commodityId: batchData.commodityId,
      commodityName: batchData.commodityName,
      quantity: batchData.quantity,
      unit: batchData.unit,
      procurementDate: batchData.procurementDate,
      warehouseId: batchData.warehouseId,
      supplier: batchData.supplier,
      expiryDate: batchData.expiryDate || 'N/A'
    });
  }

  // Chaincode 2: registerProcurement
  async registerProcurement(procurementData) {
    return await this.recordTransaction('registerProcurement', {
      procurementId: procurementData.procurementId,
      batchId: procurementData.batchId,
      commodity: procurementData.commodity,
      quantity: procurementData.quantity,
      unit: procurementData.unit,
      mandiSource: procurementData.mandiSource,
      warehouseId: procurementData.warehouseId
    });
  }

  // Chaincode 3: transferStock
  async transferStock(transferData) {
    return await this.recordTransaction('transferStock', {
      transferId: transferData.transferId,
      batchId: transferData.batchId,
      sourceWarehouseId: transferData.sourceWarehouseId,
      destWarehouseId: transferData.destWarehouseId,
      quantity: transferData.quantity,
      vehicleNo: transferData.vehicleNo,
      driverName: transferData.driverName
    });
  }

  // Chaincode 4: receiveStock
  async receiveStock(receiveData) {
    return await this.recordTransaction('receiveStock', {
      transferId: receiveData.transferId,
      batchId: receiveData.batchId,
      warehouseId: receiveData.warehouseId,
      receivedQty: receiveData.receivedQty,
      receivingOfficer: receiveData.receivingOfficer
    });
  }

  // Chaincode 5: dispatchToOffice
  async dispatchToOffice(dispatchData) {
    return await this.recordTransaction('dispatchToOffice', {
      dispatchId: dispatchData.dispatchId,
      sourceWarehouseId: dispatchData.sourceWarehouseId,
      destOfficeId: dispatchData.destOfficeId,
      items: dispatchData.items,
      vehicleNo: dispatchData.vehicleNo,
      driverDetails: dispatchData.driverDetails
    });
  }

  // Chaincode 6: confirmOfficeReceipt
  async confirmOfficeReceipt(receiptData) {
    return await this.recordTransaction('confirmOfficeReceipt', {
      dispatchId: receiptData.dispatchId,
      officeId: receiptData.officeId,
      receivedItems: receiptData.receivedItems,
      officerId: receiptData.officerId,
      discrepancy: receiptData.discrepancy || false,
      difference: receiptData.difference || [],
      remarks: receiptData.remarks || ''
    });
  }

  // Chaincode 7: distributeRation
  async distributeRation(distributionData) {
    return await this.recordTransaction('distributeRation', {
      distributionId: distributionData.distributionId,
      customerId: distributionData.customerId,
      rationCardNumber: distributionData.rationCardNumber,
      officeId: distributionData.officeId,
      officerId: distributionData.officerId,
      distributedItems: distributionData.distributedItems,
      biometricVerificationRef: distributionData.biometricVerificationRef,
      receiptNumber: distributionData.receiptNumber
    });
  }

  // Chaincode 8: recordStockAdjustment
  async recordStockAdjustment(adjustmentData) {
    return await this.recordTransaction('recordStockAdjustment', {
      adjustmentId: adjustmentData.adjustmentId,
      locationType: adjustmentData.locationType, // 'warehouse' or 'office'
      locationId: adjustmentData.locationId,
      commodity: adjustmentData.commodity,
      batchId: adjustmentData.batchId,
      adjustedQty: adjustmentData.adjustedQty,
      reason: adjustmentData.reason,
      officerId: adjustmentData.officerId
    });
  }

  // Chaincode 9: getBatchHistory
  getBatchHistory(batchId) {
    const history = [];
    for (const block of this.chain) {
      for (const tx of block.transactions) {
        const payload = tx.payload || {};
        let matches = false;

        if (payload.batchId === batchId) matches = true;
        if (payload.items && Array.isArray(payload.items)) {
          if (payload.items.some(item => item.batchId === batchId)) matches = true;
        }
        if (payload.receivedItems && Array.isArray(payload.receivedItems)) {
          if (payload.receivedItems.some(item => item.batchId === batchId)) matches = true;
        }
        if (payload.distributedItems && Array.isArray(payload.distributedItems)) {
          if (payload.distributedItems.some(item => item.batchId === batchId)) matches = true;
        }

        if (matches) {
          history.push({
            blockNumber: block.blockNumber,
            blockHash: block.hash,
            txId: tx.txId,
            action: tx.action,
            payload: tx.payload,
            timestamp: tx.timestamp,
            status: tx.status
          });
        }
      }
    }
    return history;
  }

  // Chaincode 10: getTransactionHistory
  getTransactionHistory(limit = 50, filters = {}) {
    const results = [];
    // Iterate from newest block to oldest
    for (let b = this.chain.length - 1; b >= 0; b--) {
      const block = this.chain[b];
      for (let t = block.transactions.length - 1; t >= 0; t--) {
        const tx = block.transactions[t];

        if (filters.action && tx.action !== filters.action) continue;
        if (filters.officeId) {
          const payload = tx.payload || {};
          if (payload.destOfficeId !== filters.officeId && payload.officeId !== filters.officeId) {
            continue;
          }
        }
        if (filters.batchId) {
          const payload = tx.payload || {};
          let hasBatch = payload.batchId === filters.batchId;
          if (payload.items) hasBatch = payload.items.some(i => i.batchId === filters.batchId);
          if (!hasBatch) continue;
        }

        results.push({
          blockNumber: block.blockNumber,
          blockHash: block.hash,
          previousHash: block.previousHash,
          txId: tx.txId,
          action: tx.action,
          payload: tx.payload,
          timestamp: tx.timestamp,
          status: tx.status,
          submittedBy: tx.submittedBy
        });

        if (results.length >= limit) return results;
      }
    }
    return results;
  }

  // Chaincode 11: verifyTransaction
  verifyTransaction(txId) {
    for (let i = 0; i < this.chain.length; i++) {
      const block = this.chain[i];
      // Verify block hash
      const computedHash = this.calculateBlockHash(block);
      const isBlockValid = computedHash === block.hash;

      // Verify chain link
      let isLinkValid = true;
      if (i > 0) {
        isLinkValid = block.previousHash === this.chain[i - 1].hash;
      }

      for (const tx of block.transactions) {
        if (tx.txId === txId) {
          return {
            found: true,
            isValid: isBlockValid && isLinkValid,
            txId: tx.txId,
            blockNumber: block.blockNumber,
            blockHash: block.hash,
            previousHash: block.previousHash,
            merkleRoot: block.merkleRoot,
            action: tx.action,
            payload: tx.payload,
            timestamp: tx.timestamp,
            status: tx.status,
            cryptographicProof: {
              recalculatedBlockHash: computedHash,
              blockIntegrity: isBlockValid ? 'PASSED' : 'FAILED',
              chainContinuity: isLinkValid ? 'VERIFIED' : 'BROKEN'
            }
          };
        }
      }
    }

    return {
      found: false,
      isValid: false,
      message: 'Transaction ID not found in current ledger.'
    };
  }

  getStats() {
    let totalTransactions = 0;
    const actionCounts = {};

    for (const block of this.chain) {
      for (const tx of block.transactions) {
        totalTransactions++;
        actionCounts[tx.action] = (actionCounts[tx.action] || 0) + 1;
      }
    }

    return {
      totalBlocks: this.chain.length,
      currentBlockHeight: this.chain.length - 1,
      totalTransactions,
      latestBlockHash: this.chain[this.chain.length - 1].hash,
      network: 'Hyperledger Fabric (pdschannel)',
      chaincode: 'smartpds v1.0',
      actionCounts,
      isFabricConnected: this.isFabricActive()
    };
  }
}

const blockchainService = new BlockchainLedger();

module.exports = blockchainService;

