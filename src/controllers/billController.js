const Bill = require('../models/Bill');
const Delivery = require('../models/Delivery');
const Customer = require('../models/Customer');
const mongoose = require('mongoose');

const getBills = async (req, res) => {
  try {
    const { month, year, customerId } = req.query;
    const filter = { vendorId: req.user.id };
    if (month) filter.month = parseInt(month);
    if (year)  filter.year  = parseInt(year);
    if (customerId) filter.customerId = customerId;
    const bills = await Bill.find(filter)
      .populate('customerId', 'name mobile address pricePerCan openingBalance previousPaid')
      .sort({ year: -1, month: -1 });
    res.json({ success: true, count: bills.length, bills });
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
    const customers = await Customer.find({ vendorId: req.user.id, isActive: true });
    if (customers.length === 0) {
      return res.status(400).json({ success: false, message: 'No active customers found.' });
    }

    // ✅ OPTIMIZATION: Use UTC to be timezone-safe across all server environments
    const startDate = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, 1, 0, 0, 0));
    const endDate   = new Date(Date.UTC(parseInt(year), parseInt(month),   0, 23, 59, 59));

    // ✅ OPTIMIZATION: Batch query instead of loop queries (200+ customers = 200+ queries → 1 query)
    const customerIds = customers.map(c => c._id);
    const allDeliveries = await Delivery.find({
      vendorId: req.user.id,
      customerId: { $in: customerIds },
      date: { $gte: startDate, $lte: endDate },
    }).lean(); // Use .lean() for faster read-only query

    // Group deliveries by customer
    const deliveriesByCustomer = {};
    allDeliveries.forEach(d => {
      const customerId = d.customerId.toString();
      if (!deliveriesByCustomer[customerId]) {
        deliveriesByCustomer[customerId] = [];
      }
      deliveriesByCustomer[customerId].push(d);
    });

    const billUpdates = [];
    const billsToDelete = [];

    // Process each customer
    for (const customer of customers) {
      const custIdStr = customer._id.toString();
      const deliveries = deliveriesByCustomer[custIdStr] || [];
      const totalCans = deliveries.reduce((sum, d) => sum + (d.totalQuantity || 0), 0);

      if (totalCans === 0) {
        // Track for batch delete
        billsToDelete.push({ vendorId: req.user.id, customerId: customer._id, month: parseInt(month), year: parseInt(year) });
        continue;
      }

      const totalAmount = totalCans * customer.pricePerCan;
      billUpdates.push({
        updateOne: {
          filter: { vendorId: req.user.id, customerId: customer._id, month: parseInt(month), year: parseInt(year) },
          update: { $set: { totalCans, totalAmount, generatedAt: new Date() } },
          upsert: true
        }
      });
    }

    // ✅ OPTIMIZATION: Batch delete + batch update (1 operation instead of N)
    if (billsToDelete.length > 0) {
      await Bill.deleteMany({
        $or: billsToDelete
      });
    }

    let result = { acknowledged: true, upsertedCount: 0, modifiedCount: 0 };
    if (billUpdates.length > 0) {
      result = await Bill.bulkWrite(billUpdates);
    }

    // Fetch final bills for response
    const bills = await Bill.find({ vendorId: req.user.id, month: parseInt(month), year: parseInt(year) })
      .populate('customerId', 'name mobile address pricePerCan');

    console.log(`✅ Generated ${bills.length} bills for ${customers.length} customers (optimized batch query)`);
    res.json({ success: true, message: `${bills.length} bills generated.`, bills });
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
    const { paidAmount, status, previousBalancePaid } = req.body;
    
    const bill = await Bill.findOne({ _id: req.params.id, vendorId: req.user.id });
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found.' });

    if (paidAmount !== undefined) {
      if (paidAmount < 0) return res.status(400).json({ success: false, message: 'Invalid paid amount.' });
      
      let newStatus = 'unpaid';
      if (paidAmount >= bill.totalAmount) {
        newStatus = 'paid';
      } else if (paidAmount > 0) {
        newStatus = 'partial';
      }

      bill.paidAmount = paidAmount;
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
      const customer = await Customer.findById(bill.customerId);
      if (customer) {
        const newPreviousPaid = Math.min(
          customer.openingBalance,
          (customer.previousPaid || 0) + Number(previousBalancePaid)
        );
        customer.previousPaid = newPreviousPaid;
        await customer.save();
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
