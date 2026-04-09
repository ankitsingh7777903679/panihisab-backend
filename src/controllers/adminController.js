const User = require('../models/User');
const Customer = require('../models/Customer');
const Delivery = require('../models/Delivery');
const Bill = require('../models/Bill');
const SystemSettings = require('../models/SystemSettings');

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
    
    // Add customerCount and subscription details to each vendor
    const vendorsWithDetails = await Promise.all(
      vendors.map(async (vendor) => {
        const customerCount = await Customer.countDocuments({ vendorId: vendor._id, isActive: true });
        const subDetails = vendor.getSubscriptionDetails ? vendor.getSubscriptionDetails() : null;
        return { 
          ...vendor.toObject(), 
          customerCount,
          subscriptionDetails: subDetails
        };
      })
    );

    res.json({ success: true, count: vendorsWithDetails.length, vendors: vendorsWithDetails });
  } catch (error) {
    console.error('❌ GetAllVendors error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch vendors.' });
  }
};

const getVendorById = async (req, res) => {
  try {
    const vendor = await User.findById(req.params.id).select('-password');
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found.' });
    
    // Get full subscription details
    const subscriptionDetails = vendor.getSubscriptionDetails ? vendor.getSubscriptionDetails() : null;
    
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

    res.json({ success: true, vendor, subscriptionDetails, metrics, recentDeliveries });
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
    const { date } = req.query;
    
    // Build filter
    const filter = {};
    if (date) {
      // Convert date string to midnight UTC (same as Delivery model stores)
      const dt = new Date(date);
      filter.date = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 0, 0, 0, 0));
    }
    
    const deliveries = await Delivery.find(filter)
      .populate('vendorId', 'name businessName')
      .populate('customerId', 'name mobile')
      .sort({ date: -1 })
      .limit(date ? 500 : 100); // Higher limit when filtering by date
    
    res.json({ success: true, count: deliveries.length, deliveries });
  } catch (error) {
    console.error('❌ GetAllDeliveries error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch deliveries.' });
  }
};

const getAllBills = async (req, res) => {
  try {
    const { month, year } = req.query;
    
    // Build filter
    const filter = {};
    if (month && year) {
      filter.month = parseInt(month);
      filter.year = parseInt(year);
    }
    
    const bills = await Bill.find(filter)
      .populate('vendorId', 'name businessName')
      .populate('customerId', 'name mobile')
      .sort({ createdAt: -1 });
    res.json({ success: true, count: bills.length, bills });
  } catch (error) {
    console.error('❌ GetAllBills error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch bills.' });
  }
};

/**
 * PATCH /api/admin/vendors/:id/subscription
 * Admin manually kisi vendor ki subscription activate/extend kar sakta hai.
 * Body: { days: 30, status: 'active' }  (optional — default 30 days active)
 */
const manuallyExtendSubscription = async (req, res) => {
  try {
    const vendor = await User.findById(req.params.id);
    if (!vendor || vendor.role !== 'vendor') {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    const days = parseInt(req.body.days) || 30;
    const status = req.body.status || 'active';

    const now = new Date();
    // Agar pehle se active hai to usi end date se aage badhao
    const baseDate =
      vendor.subscriptionStatus === 'active' && vendor.subscriptionEndsAt > now
        ? vendor.subscriptionEndsAt
        : now;

    const newEndDate = new Date(baseDate);
    newEndDate.setDate(newEndDate.getDate() + days);

    vendor.subscriptionStatus = status;
    vendor.subscriptionStartsAt = vendor.subscriptionStartsAt || now;
    vendor.subscriptionEndsAt = newEndDate;
    vendor.plan = 'monthly';
    await vendor.save();

    res.json({
      success: true,
      message: `Vendor ki subscription ${days} din ke liye extend kar di gayi. Nai end date: ${newEndDate.toDateString()}`,
      vendor: {
        id: vendor._id,
        name: vendor.name,
        subscriptionStatus: vendor.subscriptionStatus,
        subscriptionEndsAt: vendor.subscriptionEndsAt,
      },
    });
  } catch (error) {
    console.error('\u274C manuallyExtendSubscription error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update subscription.' });
  }
};

/**
 * GET /api/admin/subscription-stats
 * Admin ke liye quick overview: kitne trial, active, expired vendors hain.
 */
const getSubscriptionStats = async (req, res) => {
  try {
    const now = new Date();
    const [trialCount, extraCount, activeCount, expiredCount, canceledCount] = await Promise.all([
      User.countDocuments({ role: 'vendor', subscriptionStatus: 'trial', trialEndsAt: { $gt: now } }),
      User.countDocuments({ role: 'vendor', subscriptionStatus: 'extra', extraDaysEndsAt: { $gt: now } }),
      User.countDocuments({ role: 'vendor', subscriptionStatus: 'active', subscriptionEndsAt: { $gt: now } }),
      User.countDocuments({
        role: 'vendor',
        $or: [
          { subscriptionStatus: 'expired' },
          { subscriptionStatus: 'trial', trialEndsAt: { $lte: now } },
          { subscriptionStatus: 'extra', extraDaysEndsAt: { $lte: now } },
          { subscriptionStatus: 'active', subscriptionEndsAt: { $lte: now } },
        ],
      }),
      User.countDocuments({ role: 'vendor', subscriptionStatus: 'canceled' }),
    ]);

    // Vendors whose trial/subscription expires in next 7 days
    const sevenDaysLater = new Date(now);
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
    const expiringSoon = await User.find({
      role: 'vendor',
      $or: [
        { subscriptionStatus: 'trial', trialEndsAt: { $gt: now, $lte: sevenDaysLater } },
        { subscriptionStatus: 'extra', extraDaysEndsAt: { $gt: now, $lte: sevenDaysLater } },
        { subscriptionStatus: 'active', subscriptionEndsAt: { $gt: now, $lte: sevenDaysLater } },
      ],
    }).select('name mobile businessName subscriptionStatus trialEndsAt extraDaysEndsAt subscriptionEndsAt');

    // Extra period users needing reminder (last 5 days)
    const fiveDaysLater = new Date(now);
    fiveDaysLater.setDate(fiveDaysLater.getDate() + 5);
    const extraPeriodReminders = await User.find({
      role: 'vendor',
      subscriptionStatus: 'extra',
      extraDaysEndsAt: { $gt: now, $lte: fiveDaysLater }
    }).select('name mobile businessName extraDaysEndsAt extraReminderSentAt');

    res.json({
      success: true,
      stats: { trialCount, extraCount, activeCount, expiredCount, canceledCount },
      expiringSoon,
      extraPeriodReminders,
    });
  } catch (error) {
    console.error('❌ getSubscriptionStats error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch subscription stats.' });
  }
};

/**
 * POST /api/admin/vendors/:id/start-free-trial
 * Admin manually starts/reset 30-day free trial for a vendor
 * Body: { days: 30 } (optional — default 30 days)
 */
const startFreeTrial = async (req, res) => {
  try {
    const vendor = await User.findById(req.params.id);
    if (!vendor || vendor.role !== 'vendor') {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    const days = parseInt(req.body.days) || 30;
    const now = new Date();
    
    // Set fresh trial
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + days);
    
    vendor.subscriptionStatus = 'trial';
    vendor.trialStartsAt = now;
    vendor.trialEndsAt = trialEnd;
    vendor.extraDaysEndsAt = null;
    vendor.subscriptionStartsAt = null;
    vendor.subscriptionEndsAt = null;
    vendor.plan = 'free';
    
    await vendor.save();

    res.json({
      success: true,
      message: `✅ Free trial started for ${vendor.name}. Trial ends: ${trialEnd.toDateString()}`,
      subscription: vendor.getSubscriptionDetails(),
    });
  } catch (error) {
    console.error('❌ startFreeTrial error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to start free trial.' });
  }
};

/**
 * POST /api/admin/vendors/:id/start-paid-subscription
 * Admin manually activates paid subscription (offline/cash/UPI)
 * Body: { days: 30, amount: 299, paymentMethod: 'cash', note: '' }
 */
const startPaidSubscription = async (req, res) => {
  try {
    const vendor = await User.findById(req.params.id);
    if (!vendor || vendor.role !== 'vendor') {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    const days = parseInt(req.body.days) || 30;
    const amount = req.body.amount || 299;
    const paymentMethod = req.body.paymentMethod || 'manual';
    const note = req.body.note || '';
    
    const now = new Date();
    
    // If in extra period, add from extra end; if active, extend; else fresh
    let startFrom = now;
    if (vendor.subscriptionStatus === 'extra' && vendor.extraDaysEndsAt > now) {
      startFrom = vendor.extraDaysEndsAt;
    } else if (vendor.subscriptionStatus === 'active' && vendor.subscriptionEndsAt > now) {
      startFrom = vendor.subscriptionEndsAt;
    }
    
    const subscriptionEnd = new Date(startFrom);
    subscriptionEnd.setDate(subscriptionEnd.getDate() + days);
    
    vendor.subscriptionStatus = 'active';
    vendor.subscriptionStartsAt = now;
    vendor.subscriptionEndsAt = subscriptionEnd;
    vendor.plan = 'monthly';
    vendor.extraDaysEndsAt = null;
    vendor.lastPaymentId = `manual_${paymentMethod}_${Date.now()}`;
    vendor.lastOrderId = `admin_${req.user?.id || 'system'}_${Date.now()}`;
    
    await vendor.save();

    res.json({
      success: true,
      message: `✅ Paid subscription activated for ${vendor.name}. Valid until: ${subscriptionEnd.toDateString()}`,
      details: {
        vendorId: vendor._id,
        name: vendor.name,
        amount,
        paymentMethod,
        note,
        daysAdded: days,
        validFrom: startFrom,
        validUntil: subscriptionEnd,
      },
      subscription: vendor.getSubscriptionDetails(),
    });
  } catch (error) {
    console.error('❌ startPaidSubscription error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to activate paid subscription.' });
  }
};

/**
 * POST /api/admin/vendors/:id/reset-subscription
 * Reset user to expired state (clear all periods)
 */
const resetSubscription = async (req, res) => {
  try {
    const vendor = await User.findById(req.params.id);
    if (!vendor || vendor.role !== 'vendor') {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    vendor.subscriptionStatus = 'expired';
    vendor.trialStartsAt = null;
    vendor.trialEndsAt = null;
    vendor.extraDaysEndsAt = null;
    vendor.subscriptionStartsAt = null;
    vendor.subscriptionEndsAt = null;
    vendor.plan = 'free';
    vendor.extraReminderSentAt = null;
    
    await vendor.save();

    res.json({
      success: true,
      message: `✅ Subscription reset for ${vendor.name}. User is now expired.`,
      subscription: vendor.getSubscriptionDetails(),
    });
  } catch (error) {
    console.error('❌ resetSubscription error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to reset subscription.' });
  }
};

/**
 * POST /api/admin/vendors/:id/force-expire
 * Immediately expire any active subscription
 */
const forceExpire = async (req, res) => {
  try {
    const vendor = await User.findById(req.params.id);
    if (!vendor || vendor.role !== 'vendor') {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    const reason = req.body.reason || 'Manual expiration by admin';
    vendor.subscriptionStatus = 'expired';
    await vendor.save();

    res.json({
      success: true,
      message: `⚠️ Subscription force-expired for ${vendor.name}. Reason: ${reason}`,
      subscription: vendor.getSubscriptionDetails(),
    });
  } catch (error) {
    console.error('❌ forceExpire error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to expire subscription.' });
  }
};

/**
 * GET /api/admin/vendors/:id/subscription-details
 * Get detailed subscription info for a vendor
 */
const getVendorSubscriptionDetails = async (req, res) => {
  try {
    const vendor = await User.findById(req.params.id).select('-password');
    if (!vendor || vendor.role !== 'vendor') {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    const subscription = vendor.getSubscriptionDetails();
    const now = new Date();
    
    let nextAction = '';
    let nextActionDate = null;
    
    if (subscription.status === 'trial') {
      nextAction = 'Trial ends, moves to extra period';
      nextActionDate = vendor.trialEndsAt;
    } else if (subscription.status === 'extra') {
      nextAction = 'Extra period ends, account expires';
      nextActionDate = vendor.extraDaysEndsAt;
    } else if (subscription.status === 'active') {
      nextAction = 'Subscription renewal due';
      nextActionDate = vendor.subscriptionEndsAt;
    } else {
      nextAction = 'User must subscribe to continue';
    }

    res.json({
      success: true,
      vendor: {
        id: vendor._id,
        name: vendor.name,
        mobile: vendor.mobile,
        email: vendor.email,
        businessName: vendor.businessName,
      },
      subscription,
      timeline: {
        trialStartsAt: vendor.trialStartsAt,
        trialEndsAt: vendor.trialEndsAt,
        extraDaysEndsAt: vendor.extraDaysEndsAt,
        subscriptionStartsAt: vendor.subscriptionStartsAt,
        subscriptionEndsAt: vendor.subscriptionEndsAt,
      },
      nextAction,
      nextActionDate,
      canSendReminder: vendor.shouldSendExtraReminder ? vendor.shouldSendExtraReminder() : false,
    });
  } catch (error) {
    console.error('❌ getVendorSubscriptionDetails error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch subscription details.' });
  }
};

/**
 * GET /api/admin/system-status
 * Get current system subscription mode (pending/active)
 */
const getSystemStatus = async (req, res) => {
  try {
    const settings = await SystemSettings.getSettings();
    const pendingUsersCount = await User.countDocuments({ 
      role: 'vendor', 
      trialEndsAt: null 
    });
    
    res.json({
      success: true,
      system: {
        mode: settings.subscriptionMode,
        trialStartedAt: settings.trialStartedAt,
        activatedBy: settings.activatedBy,
        defaultTrialDays: settings.defaultTrialDays,
        defaultExtraDays: settings.defaultExtraDays,
        pendingUsersCount,
        message: settings.pendingModeMessage,
      },
    });
  } catch (error) {
    console.error('❌ getSystemStatus error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch system status.' });
  }
};

/**
 * POST /api/admin/activate-system
 * Admin activates subscription system - ALL users get trial at once
 * Body: { trialDays: 30, extraDays: 10 }
 */
const activateSystem = async (req, res) => {
  try {
    const settings = await SystemSettings.getSettings();
    
    // Check if already active
    if (settings.subscriptionMode === 'active') {
      return res.status(400).json({ 
        success: false, 
        message: 'System is already active. Use individual vendor controls to manage subscriptions.' 
      });
    }
    
    const trialDays = parseInt(req.body.trialDays) || 30;
    const extraDays = parseInt(req.body.extraDays) || 10;
    
    // Update system settings
    settings.subscriptionMode = 'active';
    settings.trialStartedAt = new Date();
    settings.activatedBy = req.user.id;
    settings.defaultTrialDays = trialDays;
    settings.defaultExtraDays = extraDays;
    await settings.save();
    
    // Get all vendors without trial dates
    const pendingVendors = await User.find({ 
      role: 'vendor',
      trialEndsAt: null 
    });
    
    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + trialDays);
    
    // Start trial for ALL pending vendors
    const updatePromises = pendingVendors.map(vendor => {
      vendor.subscriptionStatus = 'trial';
      vendor.trialStartsAt = now;
      vendor.trialEndsAt = trialEnd;
      return vendor.save();
    });
    
    await Promise.all(updatePromises);
    
    res.json({
      success: true,
      message: `🚀 System activated! ${pendingVendors.length} users got ${trialDays}-day trial.`,
      system: {
        mode: 'active',
        trialStartedAt: settings.trialStartedAt,
        usersActivated: pendingVendors.length,
        trialEndsAt: trialEnd,
      },
    });
  } catch (error) {
    console.error('❌ activateSystem error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to activate system.' });
  }
};

/**
 * POST /api/admin/deactivate-system
 * Emergency: Revert to pending mode (unlimited free for all)
 */
const deactivateSystem = async (req, res) => {
  try {
    const settings = await SystemSettings.getSettings();
    
    settings.subscriptionMode = 'pending';
    settings.trialStartedAt = null;
    settings.activatedBy = null;
    await settings.save();
    
    res.json({
      success: true,
      message: '⚠️ System deactivated. All users now have unlimited free access.',
      system: {
        mode: 'pending',
      },
    });
  } catch (error) {
    console.error('❌ deactivateSystem error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to deactivate system.' });
  }
};

module.exports = { getAdminStats, getAllVendors, getVendorById, toggleVendorStatus, deleteVendor, getAllCustomers, getAllDeliveries, getAllBills, manuallyExtendSubscription, getSubscriptionStats, startFreeTrial, startPaidSubscription, resetSubscription, forceExpire, getVendorSubscriptionDetails, getSystemStatus, activateSystem, deactivateSystem };
