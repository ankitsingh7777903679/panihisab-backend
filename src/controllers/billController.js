const Bill = require('../models/Bill');
const Delivery = require('../models/Delivery');
const Customer = require('../models/Customer');

const getBills = async (req, res) => {
  try {
    const { month, year, customerId } = req.query;
    const filter = { vendorId: req.user.id };
    if (month) filter.month = parseInt(month);
    if (year)  filter.year  = parseInt(year);
    if (customerId) filter.customerId = customerId;
    const bills = await Bill.find(filter)
      .populate('customerId', 'name mobile address pricePerCan')
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

    const startDate = new Date(year, month - 1, 1);
    const endDate   = new Date(year, month, 0, 23, 59, 59);

    const bills = [];
    for (const customer of customers) {
      const deliveries = await Delivery.find({
        vendorId: req.user.id,
        customerId: customer._id,
        date: { $gte: startDate, $lte: endDate },
      });
      const totalCans = deliveries.reduce((sum, d) => sum + d.quantity, 0);
      if (totalCans === 0) continue;
      const totalAmount = totalCans * customer.pricePerCan;

      const bill = await Bill.findOneAndUpdate(
        { vendorId: req.user.id, customerId: customer._id, month: parseInt(month), year: parseInt(year) },
        { totalCans, totalAmount, generatedAt: new Date() },
        { upsert: true, new: true }
      );
      bills.push(bill);
    }

    const populated = await Bill.find({ _id: { $in: bills.map(b => b._id) } })
      .populate('customerId', 'name mobile address pricePerCan');

    res.json({ success: true, message: `${bills.length} bills generated.`, bills: populated });
  } catch (error) {
    console.error('❌ GenerateBills error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to generate bills.' });
  }
};

const getBill = async (req, res) => {
  try {
    const bill = await Bill.findOne({ _id: req.params.id, vendorId: req.user.id })
      .populate('customerId', 'name mobile address pricePerCan')
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

    // Fetch all deliveries for this month to render the calendar grid
    const startDate = new Date(bill.year, bill.month - 1, 1);
    const endDate = new Date(bill.year, bill.month, 0, 23, 59, 59);
    const deliveries = await Delivery.find({
      vendorId: req.user.id,
      customerId: bill.customerId._id,
      date: { $gte: startDate, $lte: endDate }
    }).sort({ date: 1 });

    res.json({ success: true, bill, previousDues, deliveries });
  } catch (error) {
    console.error('❌ GetBill error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch bill details.' });
  }
};

const updateBillStatus = async (req, res) => {
  try {
    const { paidAmount, status } = req.body;
    
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

    await bill.populate('customerId', 'name mobile address pricePerCan');
    res.json({ success: true, bill });
  } catch (error) {
    console.error('❌ UpdateBillStatus error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update bill.' });
  }
};

module.exports = { getBills, generateBills, getBill, updateBillStatus };
