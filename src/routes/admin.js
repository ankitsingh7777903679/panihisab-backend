const express = require('express');
const router = express.Router();
const { getAdminStats, getAllVendors, getVendorById, toggleVendorStatus, deleteVendor, getAllCustomers, getAllDeliveries, getAllBills, manuallyExtendSubscription, getSubscriptionStats, startFreeTrial, startPaidSubscription, resetSubscription, forceExpire, getVendorSubscriptionDetails, getSystemStatus, activateSystem, deactivateSystem } = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/auth');

router.use(protect, adminOnly);
router.get('/stats', getAdminStats);
router.route('/vendors').get(getAllVendors);
router.route('/vendors/:id').get(getVendorById).patch(toggleVendorStatus).delete(deleteVendor);
router.get('/customers', getAllCustomers);
router.get('/deliveries', getAllDeliveries);
router.get('/bills', getAllBills);

// System-wide subscription control
router.get('/system-status', getSystemStatus);
router.post('/activate-system', activateSystem);
router.post('/deactivate-system', deactivateSystem);

// Individual vendor subscription management
router.get('/vendors/:id/subscription-details', getVendorSubscriptionDetails);
router.post('/vendors/:id/start-free-trial', startFreeTrial);
router.post('/vendors/:id/start-paid-subscription', startPaidSubscription);
router.patch('/vendors/:id/subscription', manuallyExtendSubscription);
router.post('/vendors/:id/reset-subscription', resetSubscription);
router.post('/vendors/:id/force-expire', forceExpire);
router.get('/subscription-stats', getSubscriptionStats);

module.exports = router;

