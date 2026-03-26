const User = require('../models/User');
const Customer = require('../models/Customer');
const Delivery = require('../models/Delivery');
const Bill = require('../models/Bill');

const getAdminStats = async (req, res) => {
  try {
    const now = new Date();
    const [totalVendors, activeVendors, totalCustomers, totalDeliveries, allBills] = await Promise.all([
      User.countDocuments({ role: 'vendor' }),
      User.countDocuments({ role: 'vendor', isActive: true }),
      Customer.countDocuments({ isActive: true }),
      Delivery.countDocuments(),
      Bill.find(),
    ]);
    const totalRevenue = allBills.filter(b => b.status === 'paid').reduce((sum, b) => sum + b.totalAmount, 0);
    const pendingBills = allBills.filter(b => b.status === 'unpaid').length;
    res.json({ success: true, stats: { totalVendors, activeVendors, totalCustomers, totalDeliveries, totalRevenue, pendingBills } });
  } catch (error) {
    console.error('❌ GetAdminStats error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch admin stats.' });
  }
};

const getAllVendors = async (req, res) => {
  try {
    const vendors = await User.find({ role: 'vendor' }).select('-password').sort({ createdAt: -1 });
    
    // Add customerCount to each vendor
    const vendorsWithCount = await Promise.all(
      vendors.map(async (vendor) => {
        const customerCount = await Customer.countDocuments({ vendorId: vendor._id, isActive: true });
        return { ...vendor.toObject(), customerCount };
      })
    );

    res.json({ success: true, count: vendorsWithCount.length, vendors: vendorsWithCount });
  } catch (error) {
    console.error('❌ GetAllVendors error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch vendors.' });
  }
};

const getVendorById = async (req, res) => {
  try {
    const vendor = await User.findById(req.params.id).select('-password');
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found.' });
    
    // Calculate metrics
    const customersCount = await Customer.countDocuments({ vendorId: req.params.id, isActive: true });
    const deliveriesCount = await Delivery.countDocuments({ vendorId: req.params.id });
    
    const unpaidBills = await Bill.find({ vendorId: req.params.id, status: 'unpaid' });
    const unpaidAmount = unpaidBills.reduce((sum, b) => sum + b.totalAmount, 0);
    
    const metrics = {
      customersCount,
      deliveriesCount,
      unpaidAmount
    };

    // Get recent deliveries (for UI table)
    const recentDeliveries = await Delivery.find({ vendorId: req.params.id })
      .populate('customerId', 'name mobile')
      .limit(10)
      .sort({ date: -1 });

    res.json({ success: true, vendor, metrics, recentDeliveries });
  } catch (error) {
    console.error('❌ GetVendorById error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch vendor details.' });
  }
};

const toggleVendorStatus = async (req, res) => {
  try {
    const vendor = await User.findById(req.params.id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found.' });
    vendor.isActive = !vendor.isActive;
    await vendor.save();
    res.json({ success: true, message: `Vendor ${vendor.isActive ? 'activated' : 'suspended'}.`, vendor });
  } catch (error) {
    console.error('❌ ToggleVendorStatus error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update vendor status.' });
  }
};

const deleteVendor = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Vendor deleted.' });
  } catch (error) {
    console.error('❌ DeleteVendor error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete vendor.' });
  }
};

const getAllCustomers = async (req, res) => {
  try {
    const customers = await Customer.find({ isActive: true }).populate('vendorId', 'name businessName mobile').sort({ createdAt: -1 });
    res.json({ success: true, count: customers.length, customers });
  } catch (error) {
    console.error('❌ GetAllCustomers error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch customers.' });
  }
};

const getAllDeliveries = async (req, res) => {
  try {
    const deliveries = await Delivery.find()
      .populate('vendorId', 'name businessName')
      .populate('customerId', 'name mobile')
      .sort({ date: -1 }).limit(100);
    res.json({ success: true, count: deliveries.length, deliveries });
  } catch (error) {
    console.error('❌ GetAllDeliveries error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch deliveries.' });
  }
};

const getAllBills = async (req, res) => {
  try {
    const bills = await Bill.find()
      .populate('vendorId', 'name businessName')
      .populate('customerId', 'name mobile')
      .sort({ createdAt: -1 });
    res.json({ success: true, count: bills.length, bills });
  } catch (error) {
    console.error('❌ GetAllBills error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch bills.' });
  }
};

module.exports = { getAdminStats, getAllVendors, getVendorById, toggleVendorStatus, deleteVendor, getAllCustomers, getAllDeliveries, getAllBills };
