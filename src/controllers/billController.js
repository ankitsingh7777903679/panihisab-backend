const Bill = require('../models/Bill');
const Delivery = require('../models/Delivery');
const Customer = require('../models/Customer');
const mongoose = require('mongoose');

const getBills = async (req, res) => {
  try {
    const { month, year, customerId, search, page = 1, limit = 30 } = req.query;
    const parsedPage = Number.parseInt(page, 10);
    const parsedLimit = Number.parseInt(limit, 10);
    const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 30;
    const skip = (safePage - 1) * safeLimit;
    
    const filter = { vendorId: req.user.id };
    if (month) filter.month = parseInt(month);
    if (year)  filter.year  = parseInt(year);
    if (customerId) filter.customerId = customerId;
    
    // If search term provided, find matching customers first
    let customerFilter = null;
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      const matchingCustomers = await Customer.find({
        vendorId: req.user.id,
        $or: [
          { name: searchRegex },
          { mobile: searchRegex }
        ]
      }).select('_id').lean();
      
      const customerIds = matchingCustomers.map(c => c._id.toString());
      if (customerIds.length > 0) {
        filter.customerId = { $in: customerIds };
      } else {
        // No matching customers, return empty result
        return res.json({
          success: true,
          count: 0,
          total: 0,
          page: safePage,
          pages: 0,
          limit: safeLimit,
          bills: []
        });
      }
    }
    
    // Get total count for pagination
    const total = await Bill.countDocuments(filter);
    
    const bills = await Bill.find(filter)
      .populate('customerId', 'name mobile address pricePerCan openingBalance previousPaid')
      .sort({ year: -1, month: -1 })
      .skip(skip)
      .limit(safeLimit);

    // Enrich each bill with pending context so dashboard/list can show true dues.
    let previousDuesByCustomer = {};
    let previousDueItemsByCustomer = {};
    if (bills.length > 0 && month && year) {
      const customerIds = [...new Set(bills.map(b => b.customerId?._id).filter(Boolean))];
      const selectedMonth = parseInt(month);
      const selectedYear = parseInt(year);

      const previousBills = await Bill.find({
        vendorId: req.user.id,
        customerId: { $in: customerIds },
        status: { $in: ['unpaid', 'partial'] },
        $or: [
          { year: { $lt: selectedYear } },
          { year: selectedYear, month: { $lt: selectedMonth } }
        ]
      })
        .sort({ year: 1, month: 1 })
        .select('_id customerId month year totalAmount paidAmount')
        .lean();

      previousBills.forEach((dueBill) => {
        const custId = dueBill.customerId?.toString();
        if (!custId) return;
        const pending = Math.max(0, (dueBill.totalAmount || 0) - (dueBill.paidAmount || 0));
        if (pending <= 0) return;

        previousDuesByCustomer[custId] = (previousDuesByCustomer[custId] || 0) + pending;
        if (!previousDueItemsByCustomer[custId]) {
          previousDueItemsByCustomer[custId] = [];
        }

        previousDueItemsByCustomer[custId].push({
          billId: dueBill._id.toString(),
          month: dueBill.month,
          year: dueBill.year,
          pendingAmount: pending,
        });
      });
    }

    const enrichedBills = bills.map((billDoc) => {
      const bill = billDoc.toObject();
      const customerIdStr = bill.customerId?._id?.toString();
      const openingBalance = bill.customerId?.openingBalance || 0;
      const previousPaid = bill.customerId?.previousPaid || 0;
      const openingBalancePending = Math.max(0, openingBalance - previousPaid);
      const previousBillsPending = customerIdStr ? (previousDuesByCustomer[customerIdStr] || 0) : 0;
      const previousDueItems = customerIdStr ? (previousDueItemsByCustomer[customerIdStr] || []) : [];
      const currentPending = Math.max(0, (bill.totalAmount || 0) - (bill.paidAmount || 0));

      return {
        ...bill,
        previousBillsPending,
        previousDueItems,
        openingBalancePending,
        totalDueWithPrevious: currentPending + previousBillsPending + openingBalancePending,
      };
    });
    
    res.json({ 
      success: true, 
      count: enrichedBills.length,
      total,
      page: safePage,
      pages: Math.max(1, Math.ceil(total / safeLimit)),
      limit: safeLimit,
      bills: enrichedBills 
    });
  } catch (error) {
    console.error('❌ GetBills error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch bills.' });
  }
};

const generateBills = async (req, res) => {
  try {
    const { month, year } = req.body;
    if (!month || !year) {
      return res.status(400).json({ success: false, message: 'Month and year are required.' });
    }
    const selectedMonth = Number.parseInt(month, 10);
    const selectedYear = Number.parseInt(year, 10);
    const vendorId = req.user.id;

    const customers = await Customer.find({ vendorId, isActive: true })
      .select('_id pricePerCan')
      .lean();

    if (customers.length === 0) {
      return res.status(400).json({ success: false, message: 'No active customers found.' });
    }

    // Use UTC boundaries to match delivery storage and avoid timezone drift.
    const startDate = new Date(Date.UTC(selectedYear, selectedMonth - 1, 1, 0, 0, 0));
    const endDate = new Date(Date.UTC(selectedYear, selectedMonth, 0, 23, 59, 59));

    const customerIds = customers.map((c) => c._id);
    const vendorObjectId = new mongoose.Types.ObjectId(vendorId);

    // DB-side grouping is faster than loading all deliveries and reducing in Node.
    const deliverySummaries = await Delivery.aggregate([
      {
        $match: {
          vendorId: vendorObjectId,
          customerId: { $in: customerIds },
          date: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: '$customerId',
          totalCans: { $sum: '$totalQuantity' },
        },
      },
    ]);

    const totalCansByCustomer = new Map(
      deliverySummaries.map((row) => [row._id.toString(), row.totalCans || 0])
    );

    const billUpdates = [];
    const customersWithoutDeliveries = [];
    let generatedCount = 0;

    // Build bulk writes once for all customers.
    for (const customer of customers) {
      const custIdStr = customer._id.toString();
      const totalCans = totalCansByCustomer.get(custIdStr) || 0;

      if (totalCans === 0) {
        customersWithoutDeliveries.push(customer._id);
        continue;
      }

      const totalAmount = totalCans * customer.pricePerCan;
      generatedCount += 1;

      billUpdates.push({
        updateOne: {
          filter: {
            vendorId,
            customerId: customer._id,
            month: selectedMonth,
            year: selectedYear,
          },
          update: { $set: { totalCans, totalAmount, generatedAt: new Date() } },
          upsert: true,
        },
      });
    }

    let deletedCount = 0;
    if (customersWithoutDeliveries.length > 0) {
      const deleteResult = await Bill.deleteMany({
        vendorId,
        month: selectedMonth,
        year: selectedYear,
        customerId: { $in: customersWithoutDeliveries },
      });
      deletedCount = deleteResult?.deletedCount || 0;
    }

    let result = { acknowledged: true, upsertedCount: 0, modifiedCount: 0 };
    if (billUpdates.length > 0) {
      result = await Bill.bulkWrite(billUpdates, { ordered: false });
    }

    // Normalize status in a single pass after totals are refreshed.
    await Bill.updateMany({
      vendorId,
      month: selectedMonth,
      year: selectedYear,
    }, [
      {
        $set: {
          status: {
            $switch: {
              branches: [
                { case: { $gte: ['$paidAmount', '$totalAmount'] }, then: 'paid' },
                { case: { $gt: ['$paidAmount', 0] }, then: 'partial' },
              ],
              default: 'unpaid',
            },
          },
        },
      },
    ], {
      updatePipeline: true,
    });

    console.log(`✅ Generated ${generatedCount} bills for ${customers.length} active customers (aggregation + bulkWrite)`);
    res.json({
      success: true,
      message: `${generatedCount} bills generated.`,
      generatedCount,
      upsertedCount: result?.upsertedCount || 0,
      modifiedCount: result?.modifiedCount || 0,
      deletedCount,
    });
  } catch (error) {
    console.error('❌ GenerateBills error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to generate bills.' });
  }
};

const getBill = async (req, res) => {
  try {
    const bill = await Bill.findOne({ _id: req.params.id, vendorId: req.user.id })
      .populate('customerId', 'name mobile address pricePerCan openingBalance previousPaid openingBalanceNote')
      .populate('vendorId', 'name businessName logoUrl mobile');
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found.' });

    // Fetch previous unpaid dues
    const previousDues = await Bill.find({
      vendorId: req.user.id,
      customerId: bill.customerId._id,
      status: { $in: ['unpaid', 'partial'] },
      $or: [
        { year: { $lt: bill.year } },
        { year: bill.year, month: { $lt: bill.month } }
      ]
    }).sort({ year: 1, month: 1 });

    // Fetch all deliveries for this month to render the calendar grid (UTC-safe range)
    const startDate = new Date(Date.UTC(bill.year, bill.month - 1, 1, 0, 0, 0));
    const endDate   = new Date(Date.UTC(bill.year, bill.month,     0, 23, 59, 59));
    const deliveries = await Delivery.find({
      vendorId: req.user.id,
      customerId: bill.customerId._id,
      date: { $gte: startDate, $lte: endDate }
    }).sort({ date: 1 });

    // Compute previous pending balance from opening balance
    const openingBalance = bill.customerId?.openingBalance || 0;
    const previousPaid = bill.customerId?.previousPaid || 0;
    const previousPendingBalance = Math.max(0, openingBalance - previousPaid);

    res.json({ success: true, bill, previousDues, deliveries, previousPendingBalance });
  } catch (error) {
    console.error('❌ GetBill error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch bill details.' });
  }
};

const updateBillStatus = async (req, res) => {
  try {
    const { paidAmount, status, previousBalancePaid, previousBillsPaid, previousBillsAllocations } = req.body;
    
    const bill = await Bill.findOne({ _id: req.params.id, vendorId: req.user.id });
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found.' });

    if (paidAmount !== undefined) {
      const normalizedPaidAmount = Number(paidAmount);
      if (!Number.isFinite(normalizedPaidAmount) || normalizedPaidAmount < 0) {
        return res.status(400).json({ success: false, message: 'Invalid paid amount.' });
      }
      
      let newStatus = 'unpaid';
      if (normalizedPaidAmount >= bill.totalAmount) {
        newStatus = 'paid';
      } else if (normalizedPaidAmount > 0) {
        newStatus = 'partial';
      }

      bill.paidAmount = normalizedPaidAmount;
      bill.status = newStatus;
      await bill.save();
    } else if (status) {
      // Fallback if older client sends status directly
      if (!['paid', 'unpaid', 'partial'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status.' });
      }
      bill.status = status;
      if (status === 'paid') bill.paidAmount = bill.totalAmount;
      else if (status === 'unpaid') bill.paidAmount = 0;
      await bill.save();
    } else {
      return res.status(400).json({ success: false, message: 'No update parameters provided.' });
    }

    // If previous balance was paid along with this bill, update customer's previousPaid
    if (previousBalancePaid !== undefined && Number(previousBalancePaid) > 0) {
      const normalizedPreviousBalancePaid = Number(previousBalancePaid);
      if (!Number.isFinite(normalizedPreviousBalancePaid) || normalizedPreviousBalancePaid < 0) {
        return res.status(400).json({ success: false, message: 'Invalid previous balance amount.' });
      }

      const customer = await Customer.findById(bill.customerId);
      if (customer) {
        const newPreviousPaid = Math.min(
          customer.openingBalance,
          (customer.previousPaid || 0) + normalizedPreviousBalancePaid
        );
        customer.previousPaid = newPreviousPaid;
        await customer.save();
      }
    }

    // If explicit allocations are provided, apply them to selected previous bills.
    if (Array.isArray(previousBillsAllocations) && previousBillsAllocations.length > 0) {
      const normalizedAllocations = previousBillsAllocations.map((item) => ({
        billId: item?.billId,
        amount: Number(item?.amount || 0),
      }));

      for (const allocation of normalizedAllocations) {
        if (!allocation.billId || !mongoose.Types.ObjectId.isValid(allocation.billId)) {
          return res.status(400).json({ success: false, message: 'Invalid previous bill selection.' });
        }
        if (!Number.isFinite(allocation.amount) || allocation.amount <= 0) {
          return res.status(400).json({ success: false, message: 'Invalid previous bill payment amount.' });
        }
      }

      const selectedBillIds = normalizedAllocations.map((item) => item.billId);
      const selectedPreviousBills = await Bill.find({
        _id: { $in: selectedBillIds },
        vendorId: req.user.id,
        customerId: bill.customerId,
        status: { $in: ['unpaid', 'partial'] },
        $or: [
          { year: { $lt: bill.year } },
          { year: bill.year, month: { $lt: bill.month } }
        ]
      });

      const previousBillMap = selectedPreviousBills.reduce((acc, item) => {
        acc[item._id.toString()] = item;
        return acc;
      }, {});

      for (const allocation of normalizedAllocations) {
        const previousBill = previousBillMap[allocation.billId.toString()];
        if (!previousBill) {
          return res.status(400).json({ success: false, message: 'Selected previous bill is not payable.' });
        }

        const pendingAmount = Math.max(0, (previousBill.totalAmount || 0) - (previousBill.paidAmount || 0));
        if (allocation.amount > pendingAmount) {
          return res.status(400).json({ success: false, message: 'Previous bill payment exceeds pending amount.' });
        }

        previousBill.paidAmount = (previousBill.paidAmount || 0) + allocation.amount;
        if (previousBill.paidAmount >= previousBill.totalAmount) {
          previousBill.status = 'paid';
        } else if (previousBill.paidAmount > 0) {
          previousBill.status = 'partial';
        } else {
          previousBill.status = 'unpaid';
        }

        await previousBill.save();
      }
    }
    // Backward compatibility: allocate a lump sum to oldest previous bills first.
    else if (previousBillsPaid !== undefined && Number(previousBillsPaid) > 0) {
      let remainingPreviousBillsPayment = Number(previousBillsPaid);
      if (!Number.isFinite(remainingPreviousBillsPayment) || remainingPreviousBillsPayment < 0) {
        return res.status(400).json({ success: false, message: 'Invalid previous bill dues amount.' });
      }

      const previousDueBills = await Bill.find({
        vendorId: req.user.id,
        customerId: bill.customerId,
        status: { $in: ['unpaid', 'partial'] },
        $or: [
          { year: { $lt: bill.year } },
          { year: bill.year, month: { $lt: bill.month } }
        ]
      }).sort({ year: 1, month: 1 });

      for (const previousBill of previousDueBills) {
        if (remainingPreviousBillsPayment <= 0) break;

        const pendingAmount = Math.max(0, (previousBill.totalAmount || 0) - (previousBill.paidAmount || 0));
        if (pendingAmount <= 0) continue;

        const allocatedAmount = Math.min(remainingPreviousBillsPayment, pendingAmount);
        previousBill.paidAmount = (previousBill.paidAmount || 0) + allocatedAmount;

        if (previousBill.paidAmount >= previousBill.totalAmount) {
          previousBill.status = 'paid';
        } else if (previousBill.paidAmount > 0) {
          previousBill.status = 'partial';
        } else {
          previousBill.status = 'unpaid';
        }

        await previousBill.save();
        remainingPreviousBillsPayment -= allocatedAmount;
      }
    }

    await bill.populate('customerId', 'name mobile address pricePerCan openingBalance previousPaid');
    res.json({ success: true, bill });
  } catch (error) {
    console.error('❌ UpdateBillStatus error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update bill.' });
  }
};

// ✅ NEW: Mark bill as sent via WhatsApp
const markBillAsSentViaWhatsApp = async (req, res) => {
  try {
    const bill = await Bill.findOne({ _id: req.params.id, vendorId: req.user.id });
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found.' });

    bill.sentViaWhatsApp = true;
    bill.sentAt = new Date();
    bill.sentCount = (bill.sentCount || 0) + 1;
    await bill.save();

    await bill.populate('customerId', 'name mobile address pricePerCan');
    res.json({ success: true, message: 'Bill marked as sent via WhatsApp.', bill });
  } catch (error) {
    console.error('❌ MarkBillAsSent error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to mark bill as sent.' });
  }
};

module.exports = { getBills, generateBills, getBill, updateBillStatus, markBillAsSentViaWhatsApp };
