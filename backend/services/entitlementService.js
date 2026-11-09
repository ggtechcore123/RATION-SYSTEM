const { db } = require('../config/firebase');

// Standard Indian National Food Security Act (NFSA) Entitlement Rules
const ENTITLEMENT_RULES = {
  PHH: {
    name: 'Priority Household (PHH)',
    type: 'PER_PERSON',
    commodities: {
      rice: { perPerson: 5, unit: 'KG', pricePerKg: 0 },
      wheat: { perPerson: 2, unit: 'KG', pricePerKg: 0 },
      sugar: { perHousehold: 1, unit: 'KG', pricePerKg: 13.5 },
      dal: { perHousehold: 1, unit: 'KG', pricePerKg: 30 }
    }
  },
  AAY: {
    name: 'Antyodaya Anna Yojana (AAY / Poorest of the Poor)',
    type: 'PER_HOUSEHOLD',
    commodities: {
      rice: { perHousehold: 20, unit: 'KG', pricePerKg: 0 },
      wheat: { perHousehold: 15, unit: 'KG', pricePerKg: 0 },
      sugar: { perHousehold: 1, unit: 'KG', pricePerKg: 13.5 },
      dal: { perHousehold: 2, unit: 'KG', pricePerKg: 30 }
    }
  },
  OPHH: {
    name: 'Other Priority / Non-Priority Household (NPHH)',
    type: 'HYBRID',
    commodities: {
      rice: { perPerson: 3, unit: 'KG', pricePerKg: 2 },
      wheat: { perPerson: 1, unit: 'KG', pricePerKg: 3 },
      sugar: { perHousehold: 1, unit: 'KG', pricePerKg: 25 },
      dal: { perHousehold: 1, unit: 'KG', pricePerKg: 45 }
    }
  }
};

class EntitlementService {
  /**
   * Calculate monthly entitlement for a customer based on card category and family member count.
   */
  calculateMonthlyQuota(customer) {
    const category = (customer.rationCardCategory || 'PHH').toUpperCase();
    const rules = ENTITLEMENT_RULES[category] || ENTITLEMENT_RULES.PHH;

    // Head is 1, plus active family members
    const familyMembers = Array.isArray(customer.familyMembers) ? customer.familyMembers : [];
    const activeMembersCount = 1 + familyMembers.filter(m => m.status !== 'INACTIVE').length;

    const quota = {};

    for (const [commodity, rule] of Object.entries(rules.commodities)) {
      let allocatedQty = 0;
      if (rule.perPerson) {
        allocatedQty += rule.perPerson * activeMembersCount;
      }
      if (rule.perHousehold) {
        allocatedQty += rule.perHousehold;
      }

      quota[commodity] = {
        commodity,
        name: commodity.charAt(0).toUpperCase() + commodity.slice(1),
        monthlyEntitlement: allocatedQty,
        unit: rule.unit,
        pricePerUnit: rule.pricePerKg
      };
    }

    return {
      category,
      categoryName: rules.name,
      activeMembersCount,
      quota
    };
  }

  /**
   * Get distributions received by this customer in the current calendar month.
   */
  async getCurrentMonthDistributions(customerId) {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const snap = await db.collection('distributions')
      .where('customerId', '==', customerId)
      .where('monthKey', '==', currentMonthKey)
      .get();

    const receivedTotals = {
      rice: 0,
      wheat: 0,
      sugar: 0,
      dal: 0
    };

    snap.docs.forEach(doc => {
      const dist = doc.data();
      if (Array.isArray(dist.items)) {
        dist.items.forEach(item => {
          const key = (item.commodity || '').toLowerCase();
          if (receivedTotals[key] !== undefined) {
            receivedTotals[key] += Number(item.quantity || 0);
          } else {
            receivedTotals[key] = (receivedTotals[key] || 0) + Number(item.quantity || 0);
          }
        });
      }
    });

    return {
      monthKey: currentMonthKey,
      receivedTotals,
      historyCount: snap.docs.length
    };
  }

  /**
   * Compute complete remaining entitlement for current month.
   */
  async getBeneficiaryEntitlementSummary(customer) {
    const quotaInfo = this.calculateMonthlyQuota(customer);
    const monthDist = await this.getCurrentMonthDistributions(customer.customerId || customer.id);

    const itemsSummary = [];

    for (const [commKey, quotaItem] of Object.entries(quotaInfo.quota)) {
      const alreadyReceived = monthDist.receivedTotals[commKey] || 0;
      const remaining = Math.max(0, quotaItem.monthlyEntitlement - alreadyReceived);

      itemsSummary.push({
        commodity: commKey,
        name: quotaItem.name,
        monthlyEntitlement: quotaItem.monthlyEntitlement,
        alreadyReceived,
        remaining,
        unit: quotaItem.unit,
        pricePerUnit: quotaItem.pricePerUnit
      });
    }

    return {
      customerId: customer.customerId || customer.id,
      customerName: customer.fullName,
      rationCardNumber: customer.rationCardNumber,
      category: quotaInfo.category,
      categoryName: quotaInfo.categoryName,
      activeMembersCount: quotaInfo.activeMembersCount,
      monthKey: monthDist.monthKey,
      items: itemsSummary
    };
  }
}

const entitlementService = new EntitlementService();
module.exports = {
  entitlementService,
  ENTITLEMENT_RULES
};

