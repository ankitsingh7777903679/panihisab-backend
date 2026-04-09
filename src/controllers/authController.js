const jwt = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '30d' });

// Helper to format user response with subscription details
const formatUserResponse = (user) => {
  const subDetails = user.getSubscriptionDetails();
  return {
    id: user._id,
    name: user.name,
    mobile: user.mobile,
    email: user.email,
    businessName: user.businessName,
    logoUrl: user.logoUrl,
    role: user.role,
    isActive: user.isActive,
    subscription: {
      status: subDetails.status,
      plan: subDetails.plan,
      isActive: subDetails.isActive,
      daysLeft: subDetails.daysLeft,
      endDate: subDetails.endDate,
      isExpiringSoon: subDetails.isExpiringSoon,
      message: subDetails.message,
    },
  };
};

// POST /api/auth/register
const register = async (req, res) => {
  try {
    const { name, mobile, password, businessName } = req.body;
    if (!name || !mobile || !password) {
      return res.status(400).json({ success: false, message: 'Name, mobile, and password are required.' });
    }
    const exists = await User.findOne({ mobile });
    if (exists) {
      return res.status(400).json({ success: false, message: 'Mobile number already registered.' });
    }
    const user = await User.create({ name, mobile, password, businessName: businessName || '' });
    res.status(201).json({
      success: true,
      token: generateToken(user._id, user.role),
      user: formatUserResponse(user),
    });
  } catch (error) {
    console.error('❌ Register error:', error.message);
    const message = error.code === 11000 ? 'Mobile number already registered.' : 'Registration failed. Please try again.';
    res.status(error.code === 11000 ? 400 : 500).json({ success: false, message });
  }
};

const login = async (req, res) => {
  try {
    const { mobile, email, password } = req.body;
    
    // Support login by mobile OR email
    if (!password || (!mobile && !email)) {
      return res.status(400).json({ success: false, message: 'Email/Mobile and password are required.' });
    }
    
    const query = mobile ? { mobile } : { email };
    const user = await User.findOne(query);
    
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }
    if (!user.isActive) {
      return res.status(403).json({ success: false, code: 'ACCOUNT_SUSPENDED', message: 'Account suspended. Contact admin.' });
    }
    res.json({
      success: true,
      token: generateToken(user._id, user.role),
      user: formatUserResponse(user),
    });
  } catch (error) {
    console.error('❌ Login error:', error.message);
    res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
};

// GET /api/auth/me
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    res.json({ success: true, user: formatUserResponse(user) });
  } catch (error) {
    console.error('❌ GetMe error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch profile.' });
  }
};

// GET /api/auth/subscription-status (NEW - detailed subscription check)
const getSubscriptionStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      'subscriptionStatus plan trialEndsAt extraDaysEndsAt subscriptionEndsAt isActive role trialStartsAt'
    );
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const subDetails = await user.getSubscriptionDetails();
    const canPerformWrites = await user.hasActiveSubscription();
    
    res.json({
      success: true,
      subscription: subDetails,
      canPerformWrites,
      warnings: {
        isTrialExpiringSoon: user.isTrialExpiringSoon(),
        isSubscriptionExpiringSoon: user.isSubscriptionExpiringSoon(),
        isExtraPeriodExpiringSoon: user.isExtraPeriodExpiringSoon ? user.isExtraPeriodExpiringSoon() : false,
      },
    });
  } catch (error) {
    console.error('❌ GetSubscriptionStatus error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch subscription status.' });
  }
};

module.exports = { register, login, getMe, getSubscriptionStatus };
