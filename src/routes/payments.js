const express = require('express');
const router = express.Router();
const { createOrder, razorpayWebhook, getSubscriptionStatus } = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

/**
 * IMPORTANT: Webhook route ko express.raw() chahiye, express.json() nahi.
 * Isliye yeh route PEHLE define karo, protect middleware ke bahar.
 * Index.js mein /api/payments/webhook ke liye alag raw parser lagaya hai.
 */
router.post('/webhook', razorpayWebhook);

// Protected routes (login required)
router.use(protect);
router.post('/create-order', createOrder);
router.get('/status', getSubscriptionStatus);

module.exports = router;
