const Razorpay = require('razorpay');
const crypto = require('crypto');
const User = require('../models/User');
const Customer = require('../models/Customer');
// Initialize Razorpay instance
// Keys .env mein hain — aap baad mein real keys daloge
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'YOUR_RAZORPAY_KEY_ID',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'YOUR_RAZORPAY_KEY_SECRET',
});

// Subscription pricing (INR in paise — 1 rupee = 100 paise)
// Pricing logic: <= 200 customers: ₹299/month, > 200 customers: ₹499/month
const SUBSCRIPTION_DAYS = 30;           // 30 din ki subscription

/**
 * POST /api/payments/create-order
 * Vendor ke liye ek Razorpay Order banata hai.
 * Frontend is orderId se Razorpay Checkout open karta hai.
 */
const createOrder = async (req, res) => {
  try {
    // Check karo ki keys set hain ya nahi (placeholder check)
    if (
      !process.env.RAZORPAY_KEY_ID ||
      process.env.RAZORPAY_KEY_ID === 'YOUR_RAZORPAY_KEY_ID_HERE'
    ) {
      return res.status(503).json({
        success: false,
        message: 'Payment gateway abhi configure nahi hua. Admin se contact karein.',
      });
    }

    const user = await User.findById(req.user.id).select('name mobile email subscriptionStatus');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Customer count nikalo dynamic pricing ke liye
    const customerCount = await Customer.countDocuments({ vendorId: user._id, isActive: true });
    const priceRupees = customerCount <= 200 ? 299 : 499;
    const amountPaise = priceRupees * 100;

    const options = {
      amount: amountPaise,
      currency: 'INR',
      receipt: `receipt_${user._id}_${Date.now()}`,
      notes: {
        userId: user._id.toString(),
        userName: user.name,
        userMobile: user.mobile,
        plan: 'monthly',
      },
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID || 'YOUR_RAZORPAY_KEY_ID',
      user: {
        name: user.name,
        mobile: user.mobile,
        email: user.email || '',
      },
    });
  } catch (error) {
    console.error('❌ createOrder error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to create payment order.' });
  }
};

/**
 * POST /api/payments/webhook
 * Razorpay payment successful hone par is route ko call karta hai.
 * IMPORTANT: Yeh raw body chahta hai (express.raw middleware — index.js mein set hai).
 * Signature verify karke user ka subscription activate karta hai.
 */
const razorpayWebhook = async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'YOUR_RAZORPAY_WEBHOOK_SECRET';

  try {
    // Razorpay ka signature header
    const signature = req.headers['x-razorpay-signature'];
    if (!signature) {
      return res.status(400).json({ success: false, message: 'Missing signature.' });
    }

    // Signature verify karo (HMAC SHA256)
    const bodyString = req.body.toString('utf8');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(bodyString)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.warn('⚠️ Webhook signature mismatch!');
      return res.status(400).json({ success: false, message: 'Invalid signature.' });
    }

    const event = JSON.parse(bodyString);

    // Sirf payment.captured event handle karo (payment confirmed)
    if (event.event === 'payment.captured') {
      const payment = event.payload.payment.entity;
      const userId = payment.notes?.userId;

      if (!userId) {
        console.warn('⚠️ Webhook: userId notes mein nahi mila.');
        return res.status(200).json({ success: true }); // Razorpay ko 200 bhejo warna retry karega
      }

      // Subscription dates calculate karo
      const now = new Date();
      let subscriptionEnd = new Date(now);
      
      // If user is in extra period, add 30 days from extra period end
      const user = await User.findById(userId);
      if (user && user.subscriptionStatus === 'extra' && user.extraDaysEndsAt) {
        subscriptionEnd = new Date(user.extraDaysEndsAt);
      }
      subscriptionEnd.setDate(subscriptionEnd.getDate() + SUBSCRIPTION_DAYS);

      // User ka subscription activate karo
      await User.findByIdAndUpdate(userId, {
        subscriptionStatus: 'active',
        plan: 'monthly',
        subscriptionStartsAt: now,
        subscriptionEndsAt: subscriptionEnd,
        lastPaymentId: payment.id,
        lastOrderId: payment.order_id,
      });

      console.log(`✅ Subscription activated for user: ${userId} until ${subscriptionEnd.toDateString()}`);
    }

    // Razorpay ko hamesha 200 bhejo — warna woh retry karta rahega
    res.status(200).json({ success: true, received: true });
  } catch (error) {
    console.error('❌ Webhook error:', error.message);
    res.status(500).json({ success: false, message: 'Webhook processing failed.' });
  }
};

/**
 * GET /api/payments/status
 * Frontend check kare ki user ka current subscription kya hai.
 */
const getSubscriptionStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      'subscriptionStatus trialStartsAt trialEndsAt subscriptionStartsAt subscriptionEndsAt plan'
    );
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const now = new Date();
    const isActive = await user.hasActiveSubscription();

    let daysLeft = 0;
    let extraDaysLeft = 0;
    if (user.subscriptionStatus === 'trial' && user.trialEndsAt) {
      daysLeft = Math.max(0, Math.ceil((user.trialEndsAt - now) / (1000 * 60 * 60 * 24)));
    } else if (user.subscriptionStatus === 'extra' && user.extraDaysEndsAt) {
      extraDaysLeft = Math.max(0, Math.ceil((user.extraDaysEndsAt - now) / (1000 * 60 * 60 * 24)));
      daysLeft = extraDaysLeft;
    } else if (user.subscriptionStatus === 'active' && user.subscriptionEndsAt) {
      daysLeft = Math.max(0, Math.ceil((user.subscriptionEndsAt - now) / (1000 * 60 * 60 * 24)));
    }

    // Dynamic pricing return karo next renewal/upgrade ke liye
    const customerCount = await Customer.countDocuments({ vendorId: req.user.id, isActive: true });
    const priceRupees = customerCount <= 200 ? 299 : 499;

    res.json({
      success: true,
      subscription: {
        status: user.subscriptionStatus,
        plan: user.plan,
        isActive,
        daysLeft,
        extraDaysLeft,
        trialEndsAt: user.trialEndsAt,
        extraDaysEndsAt: user.extraDaysEndsAt,
        subscriptionEndsAt: user.subscriptionEndsAt,
        priceMonthly: priceRupees,
        customerCount: customerCount,
        showExtraReminder: user.subscriptionStatus === 'extra' && extraDaysLeft > 0 && extraDaysLeft <= 5,
      },
    });
  } catch (error) {
    console.error('❌ getSubscriptionStatus error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch subscription status.' });
  }
};

module.exports = { createOrder, razorpayWebhook, getSubscriptionStatus };
