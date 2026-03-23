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
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [totalCustomers, todayDeliveries, monthlyBills, pendingBills] = await Promise.all([
      Customer.countDocuments({ vendorId, isActive: true }),
      Delivery.find({ vendorId, date: { $gte: todayStart, $lte: todayEnd } })
        .populate('customerId', 'name address'),
      Bill.find({ vendorId, month: now.getMonth() + 1, year: now.getFullYear() }),
      Bill.find({ vendorId, status: 'unpaid' }),
    ]);

    const todayCans = todayDeliveries.reduce((sum, d) => sum + d.quantity, 0);
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
