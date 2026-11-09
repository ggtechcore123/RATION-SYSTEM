'use strict';

const { Contract } = require('fabric-contract-api');

class SmartPDSContract extends Contract {

  async initLedger(ctx) {
    console.info('============= START : Initialize Smart PDS Ledger ===========');
    const genesisRecord = {
      docType: 'genesis',
      network: 'Indian Public Distribution System (PDS) Hyperledger Fabric Channel',
      authority: 'Ministry of Consumer Affairs, Food & Public Distribution',
      initializedAt: new Date().toISOString()
    };
    await ctx.stub.putState('GENESIS_RECORD', Buffer.from(JSON.stringify(genesisRecord)));
    console.info('============= END : Initialize Smart PDS Ledger ===========');
  }

  // 1. registerBatch
  async registerBatch(ctx, batchId, commodityId, commodityName, quantity, unit, procurementDate, warehouseId, supplier, expiryDate) {
    const exists = await this.assetExists(ctx, batchId);
    if (exists) {
      throw new Error(`Batch ${batchId} already exists on the ledger.`);
    }

    const batch = {
      docType: 'stockBatch',
      batchId,
      commodityId,
      commodityName,
      quantity: parseFloat(quantity),
      availableQuantity: parseFloat(quantity),
      unit,
      procurementDate,
      warehouseId,
      supplier,
      expiryDate,
      status: 'ACTIVE',
      recordedAt: new Date().toISOString()
    };

    await ctx.stub.putState(batchId, Buffer.from(JSON.stringify(batch)));
    return JSON.stringify(batch);
  }

  // 2. registerProcurement
  async registerProcurement(ctx, procurementId, batchId, commodity, quantity, unit, mandiSource, warehouseId) {
    const procurement = {
      docType: 'procurement',
      procurementId,
      batchId,
      commodity,
      quantity: parseFloat(quantity),
      unit,
      mandiSource,
      warehouseId,
      timestamp: new Date().toISOString()
    };

    await ctx.stub.putState(procurementId, Buffer.from(JSON.stringify(procurement)));
    return JSON.stringify(procurement);
  }

  // 3. transferStock
  async transferStock(ctx, transferId, batchId, sourceWarehouseId, destWarehouseId, quantity, vehicleNo, driverName) {
    const batchBytes = await ctx.stub.getState(batchId);
    if (!batchBytes || batchBytes.length === 0) {
      throw new Error(`Batch ${batchId} does not exist`);
    }

    const batch = JSON.parse(batchBytes.toString());
    const qty = parseFloat(quantity);
    if (batch.availableQuantity < qty) {
      throw new Error(`Insufficient batch quantity. Available: ${batch.availableQuantity}, Transfer: ${qty}`);
    }

    batch.availableQuantity -= qty;
    await ctx.stub.putState(batchId, Buffer.from(JSON.stringify(batch)));

    const transfer = {
      docType: 'warehouseTransfer',
      transferId,
      batchId,
      sourceWarehouseId,
      destWarehouseId,
      quantity: qty,
      vehicleNo,
      driverName,
      status: 'IN_TRANSIT',
      timestamp: new Date().toISOString()
    };

    await ctx.stub.putState(transferId, Buffer.from(JSON.stringify(transfer)));
    return JSON.stringify(transfer);
  }

  // 4. receiveStock
  async receiveStock(ctx, transferId, batchId, warehouseId, receivedQty, receivingOfficer) {
    const transferBytes = await ctx.stub.getState(transferId);
    if (!transferBytes || transferBytes.length === 0) {
      throw new Error(`Transfer ${transferId} does not exist`);
    }

    const transfer = JSON.parse(transferBytes.toString());
    transfer.status = 'RECEIVED';
    transfer.receivedQty = parseFloat(receivedQty);
    transfer.receivingOfficer = receivingOfficer;
    transfer.receivedAt = new Date().toISOString();

    await ctx.stub.putState(transferId, Buffer.from(JSON.stringify(transfer)));
    return JSON.stringify(transfer);
  }

  // 5. dispatchToOffice
  async dispatchToOffice(ctx, dispatchId, sourceWarehouseId, destOfficeId, batchItemsJson, vehicleNo, driverDetails) {
    const items = JSON.parse(batchItemsJson);

    // Verify and deduct quantities
    for (const item of items) {
      const batchBytes = await ctx.stub.getState(item.batchId);
      if (batchBytes && batchBytes.length > 0) {
        const batch = JSON.parse(batchBytes.toString());
        batch.availableQuantity = Math.max(0, batch.availableQuantity - parseFloat(item.quantity));
        await ctx.stub.putState(item.batchId, Buffer.from(JSON.stringify(batch)));
      }
    }

    const dispatch = {
      docType: 'officeDispatch',
      dispatchId,
      sourceWarehouseId,
      destOfficeId,
      items,
      vehicleNo,
      driverDetails,
      status: 'IN_TRANSIT',
      dispatchedAt: new Date().toISOString()
    };

    await ctx.stub.putState(dispatchId, Buffer.from(JSON.stringify(dispatch)));
    return JSON.stringify(dispatch);
  }

  // 6. confirmOfficeReceipt
  async confirmOfficeReceipt(ctx, dispatchId, officeId, receivedItemsJson, officerId, discrepancy, remarks) {
    const dispatchBytes = await ctx.stub.getState(dispatchId);
    if (!dispatchBytes || dispatchBytes.length === 0) {
      throw new Error(`Dispatch ${dispatchId} does not exist on ledger.`);
    }

    const dispatch = JSON.parse(dispatchBytes.toString());
    dispatch.status = discrepancy === 'true' || discrepancy === true ? 'MISMATCH_CONFIRMED' : 'DELIVERED';
    dispatch.receivedItems = JSON.parse(receivedItemsJson);
    dispatch.officerId = officerId;
    dispatch.discrepancy = discrepancy;
    dispatch.remarks = remarks;
    dispatch.deliveredAt = new Date().toISOString();

    await ctx.stub.putState(dispatchId, Buffer.from(JSON.stringify(dispatch)));
    return JSON.stringify(dispatch);
  }

  // 7. distributeRation
  async distributeRation(ctx, distributionId, customerId, rationCardNo, officeId, officerId, itemsJson, biometricProofRef) {
    const distribution = {
      docType: 'distribution',
      distributionId,
      customerId,
      rationCardNo,
      officeId,
      officerId,
      items: JSON.parse(itemsJson),
      biometricProofRef, // Keep raw template off-chain, reference hash only
      timestamp: new Date().toISOString()
    };

    await ctx.stub.putState(distributionId, Buffer.from(JSON.stringify(distribution)));
    return JSON.stringify(distribution);
  }

  // 8. recordStockAdjustment
  async recordStockAdjustment(ctx, adjustmentId, locationType, locationId, commodity, batchId, adjustedQty, reason, officerId) {
    const adjustment = {
      docType: 'stockAdjustment',
      adjustmentId,
      locationType,
      locationId,
      commodity,
      batchId,
      adjustedQty: parseFloat(adjustedQty),
      reason,
      officerId,
      timestamp: new Date().toISOString()
    };

    await ctx.stub.putState(adjustmentId, Buffer.from(JSON.stringify(adjustment)));
    return JSON.stringify(adjustment);
  }

  // 9. getBatchHistory
  async getBatchHistory(ctx, batchId) {
    const iterator = await ctx.stub.getHistoryForKey(batchId);
    const allResults = [];

    while (true) {
      const res = await iterator.next();
      if (res.value && res.value.value.toString()) {
        const record = {
          txId: res.value.txId,
          timestamp: res.value.timestamp,
          isDelete: res.value.isDelete,
          value: JSON.parse(res.value.value.toString('utf8'))
        };
        allResults.push(record);
      }
      if (res.done) {
        await iterator.close();
        break;
      }
    }

    return JSON.stringify(allResults);
  }

  // 10. getTransactionHistory
  async getTransactionHistory(ctx, queryDocType) {
    const queryString = {
      selector: {
        docType: queryDocType || { $ne: 'genesis' }
      }
    };
    const iterator = await ctx.stub.getQueryResult(JSON.stringify(queryString));
    const results = [];

    while (true) {
      const res = await iterator.next();
      if (res.value && res.value.value.toString()) {
        results.push(JSON.parse(res.value.value.toString('utf8')));
      }
      if (res.done) {
        await iterator.close();
        break;
      }
    }

    return JSON.stringify(results);
  }

  // 11. verifyTransaction
  async verifyTransaction(ctx, assetId) {
    const assetBytes = await ctx.stub.getState(assetId);
    if (!assetBytes || assetBytes.length === 0) {
      return JSON.stringify({ verified: false, message: `Record ${assetId} not found on ledger.` });
    }
    return JSON.stringify({
      verified: true,
      assetId,
      data: JSON.parse(assetBytes.toString('utf8'))
    });
  }

  async assetExists(ctx, assetId) {
    const assetBytes = await ctx.stub.getState(assetId);
    return assetBytes && assetBytes.length > 0;
  }
}

module.exports = SmartPDSContract;

