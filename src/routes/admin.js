const express = require('express');
const router = express.Router();
const { getAdminStats, getAllVendors, getVendorById, toggleVendorStatus, deleteVendor, getAllCustomers, getAllDeliveries, getAllBills, manuallyExtendSubscription, getSubscriptionStats } = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/auth');

router.use(protect, adminOnly);
router.get('/stats', getAdminStats);
router.route('/vendors').get(getAllVendors);
router.route('/vendors/:id').get(getVendorById).patch(toggleVendorStatus).delete(deleteVendor);
router.get('/customers', getAllCustomers);
router.get('/deliveries', getAllDeliveries);
router.get('/bills', getAllBills);

// Subscription management (Admin only)
router.patch('/vendors/:id/subscription', manuallyExtendSubscription);
router.get('/subscription-stats', getSubscriptionStats);

module.exports = router;

