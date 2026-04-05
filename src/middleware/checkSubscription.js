const User = require('../models/User');

/**
 * Middleware: checkSubscription
 * Sirf write operations (POST/PUT/DELETE) par use karo.
 * Agar vendor ki trial ya subscription active nahi hai,
 * to 403 error return karta hai.
 *
 * Admin role wale hamesha bypass karenge.
 */
const checkSubscription = async (req, res, next) => {
  try {
    // Admin ko subscription check ki zaroorat nahi
    if (req.user?.role === 'admin') return next();

    const user = await User.findById(req.user.id).select(
      'subscriptionStatus trialEndsAt subscriptionEndsAt isActive role plan'
    );

    if (!user) {
      console.warn(`⚠️  User not found during subscription check: ${req.user.id}`);
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    // User is not active (suspended/deleted)
    if (!user.isActive) {
      console.warn(`⚠️  Inactive user tried write operation: ${req.user.id}`);
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended. Please contact support.',
      });
    }

    // Check if subscription is active
    if (user.hasActiveSubscription()) {
      return next(); // Active/Trial hai — allow
    }

    // Subscription expired ya canceled - provide detailed info
    const subDetails = user.getSubscriptionDetails();
    console.warn(`⚠️  Write attempt by user with expired subscription: ${req.user.id} (status: ${user.subscriptionStatus})`);
    
    return res.status(403).json({
      success: false,
      code: 'SUBSCRIPTION_EXPIRED',
      subscription: {
        status: subDetails.status,
        plan: subDetails.plan,
        message: subDetails.message,
      },
      message: `Your ${user.subscriptionStatus === 'trial' ? 'free trial' : 'subscription'} has ended. Please upgrade to continue.`,
      actionRequired: true,
    });
  } catch (error) {
    console.error('❌ checkSubscription error:', error.message);
    res.status(500).json({ success: false, message: 'Subscription check failed.' });
  }
};

module.exports = { checkSubscription };
