const User = require('../models/User');
const Customer = require('../models/Customer');
const Delivery = require('../models/Delivery');
const Bill = require('../models/Bill');

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json({ success: true, user });
  } catch (error) {
    console.error('❌ GetProfile error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch profile.' });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name, businessName, logoUrl } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, businessName, logoUrl },
      { new: true, runValidators: true }
    ).select('-password');
    res.json({ success: true, user });
  } catch (error) {
    console.error('❌ UpdateProfile error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
};

const getDashboard = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const now = new Date();
    // Use UTC dates to match how delivery dates are stored (UTC midnight)
    const todayUTC     = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayStart   = todayUTC;
    const todayEnd     = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));
    const monthStart   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd     = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));

    const [totalCustomers, todayDeliveries, monthlyBills, pendingBills] = await Promise.all([
      Customer.countDocuments({ vendorId, isActive: true }),
      Delivery.find({ vendorId, date: { $gte: todayStart, $lte: todayEnd } })
        .populate('customerId', 'name address'),
      Bill.find({ vendorId, month: now.getMonth() + 1, year: now.getFullYear() }),
      Bill.find({ vendorId, status: 'unpaid' }),
    ]);

    // NEW schema: each delivery day-doc has totalQuantity (sum of all entries)
    const todayCans = todayDeliveries.reduce((sum, d) => sum + (d.totalQuantity || 0), 0);
    const monthlyEarnings = monthlyBills.filter(b => b.status === 'paid').reduce((sum, b) => sum + b.totalAmount, 0);
    const pendingAmount   = pendingBills.reduce((sum, b) => sum + b.totalAmount, 0);

    res.json({
      success: true,
      stats: { totalCustomers, todayCans, monthlyEarnings, pendingAmount, pendingBillsCount: pendingBills.length },
      recentDeliveries: todayDeliveries,
    });
  } catch (error) {
    console.error('❌ GetDashboard error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard.' });
  }
};

module.exports = { getProfile, updateProfile, getDashboard };
