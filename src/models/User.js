const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const SystemSettings = require('./SystemSettings');

const UserSchema = new mongoose.Schema(
  {
    name:         { type: String, required: true, trim: true },
    mobile:       { type: String, required: true, unique: true, trim: true },
    email:        { type: String, trim: true, lowercase: true },
    password:     { type: String, required: true, minlength: 6 },
    businessName: { type: String, default: '', trim: true },
    logoUrl:      { type: String, default: '' },
    role:         { type: String, enum: ['vendor', 'admin'], default: 'vendor' },
    isActive:     { type: Boolean, default: true },

    // ── Subscription ──────────────────────────────────────────────────────────
    subscriptionStatus: {
      type: String,
      enum: ['trial', 'extra', 'active', 'expired', 'canceled'],
      default: 'trial',
    },
    trialStartsAt:      { type: Date, default: Date.now },
    trialEndsAt:        { type: Date },          // auto-set 30 days after creation
    extraDaysEndsAt:    { type: Date },          // 10-day extra period after trial
    extraReminderSentAt:{ type: Date },          // last reminder sent date
    subscriptionStartsAt: { type: Date },
    subscriptionEndsAt:   { type: Date },
    plan: {
      type: String,
      enum: ['free', 'monthly', 'yearly'],
      default: 'free',
    },
    // Razorpay payment tracking
    lastPaymentId:   { type: String, default: '' },
    lastOrderId:     { type: String, default: '' },
  },
  { timestamps: true }
);

// Auto-set trial dates ONLY if system is already in 'active' mode
// Otherwise, keep dates null (unlimited free access until admin activates)
UserSchema.pre('validate', async function () {
  // Check system settings
  let systemActive = false;
  try {
    systemActive = await SystemSettings.isSubscriptionActive();
  } catch (err) {
    // If SystemSettings not available yet, assume pending mode
    systemActive = false;
  }
  
  // If system is active and this is new user, auto-start their trial
  if (this.isNew && systemActive && !this.trialEndsAt) {
    const now = new Date();
    const settings = await SystemSettings.getSettings();
    const trialDays = settings.defaultTrialDays || 30;
    
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + trialDays);
    
    this.trialStartsAt = now;
    this.trialEndsAt = trialEnd;
    this.subscriptionStatus = 'trial';
  }
  
  // Auto-transition trial -> extra -> expired (only if dates are set)
  const now = new Date();
  if (this.subscriptionStatus === 'trial' && this.trialEndsAt && this.trialEndsAt <= now) {
    this.subscriptionStatus = 'extra';
    const extraEnd = new Date(this.trialEndsAt);
    extraEnd.setDate(extraEnd.getDate() + 10); // 10-day extra period
    this.extraDaysEndsAt = extraEnd;
  }
  if (this.subscriptionStatus === 'extra' && this.extraDaysEndsAt && this.extraDaysEndsAt <= now) {
    this.subscriptionStatus = 'expired';
  }
});

// Hash password before save
UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match password
UserSchema.methods.matchPassword = async function (entered) {
  return await bcrypt.compare(entered, this.password);
};

// Helper: is this user allowed to perform write actions?
UserSchema.methods.hasActiveSubscription = async function () {
  // Check if system is in 'pending' mode (unlimited free access)
  let systemActive = false;
  try {
    systemActive = await SystemSettings.isSubscriptionActive();
  } catch (err) {
    systemActive = false;
  }
  
  // If system not activated yet, everyone has unlimited free access
  if (!systemActive) {
    return true;
  }
  
  // System is active - check actual subscription status
  const now = new Date();
  if (this.subscriptionStatus === 'trial' && this.trialEndsAt > now) return true;
  if (this.subscriptionStatus === 'extra' && this.extraDaysEndsAt > now) return true;
  if (this.subscriptionStatus === 'active' && this.subscriptionEndsAt > now) return true;
  return false;
};

// Get subscription details with days remaining
UserSchema.methods.getSubscriptionDetails = async function () {
  const now = new Date();
  let endDate = null;
  let daysLeft = 0;
  let isExpiringSoon = false;
  let reason = '';
  let extraDaysLeft = 0;
  let systemMode = 'pending';
  let isSystemActive = false;
  
  // Check system settings
  try {
    const settings = await SystemSettings.getSettings();
    systemMode = settings.subscriptionMode;
    isSystemActive = settings.subscriptionMode === 'active';
  } catch (err) {
    // Default to pending if settings not available
  }

  // If system is in pending mode, show unlimited free access
  if (!isSystemActive) {
    return {
      status: 'pending',
      plan: 'free',
      endDate: null,
      daysLeft: Infinity,
      extraDaysLeft: 0,
      isExpiringSoon: false,
      isActive: true,
      reason: '',
      message: 'Unlimited free access - Trial period will start soon',
      showExtraReminder: false,
      systemMode: 'pending',
    };
  }

  // System is active - show actual subscription details
  if (this.subscriptionStatus === 'trial') {
    if (this.trialEndsAt) {
      endDate = this.trialEndsAt;
      daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
      isExpiringSoon = daysLeft > 0 && daysLeft <= 7;
      if (daysLeft <= 0) {
        reason = 'Trial period has ended';
      }
    }
  } else if (this.subscriptionStatus === 'extra') {
    if (this.extraDaysEndsAt) {
      endDate = this.extraDaysEndsAt;
      daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
      extraDaysLeft = daysLeft;
      isExpiringSoon = daysLeft > 0 && daysLeft <= 5;
      if (daysLeft <= 0) {
        reason = 'Extra period has ended. Please subscribe to continue.';
      }
    }
  } else if (this.subscriptionStatus === 'active') {
    if (this.subscriptionEndsAt) {
      endDate = this.subscriptionEndsAt;
      daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
      isExpiringSoon = daysLeft > 0 && daysLeft <= 7;
      if (daysLeft <= 0) {
        reason = 'Subscription has expired';
      }
    }
  } else if (this.subscriptionStatus === 'expired') {
    reason = 'Your subscription has expired';
  } else if (this.subscriptionStatus === 'canceled') {
    reason = 'Your subscription has been canceled';
  }

  return {
    status: this.subscriptionStatus,
    plan: this.plan,
    endDate,
    daysLeft: Math.max(0, daysLeft),
    extraDaysLeft,
    isExpiringSoon,
    isActive: await this.hasActiveSubscription(),
    reason,
    message: reason || (await this.hasActiveSubscription() ? 'Active' : 'Not active'),
    showExtraReminder: this.subscriptionStatus === 'extra' && extraDaysLeft > 0 && extraDaysLeft <= 5,
    systemMode: 'active',
  };
};

// Check if trial is ending soon (7 days or less)
UserSchema.methods.isTrialExpiringSoon = function () {
  if (this.subscriptionStatus !== 'trial' || !this.trialEndsAt) return false;
  const now = new Date();
  const daysLeft = Math.ceil((this.trialEndsAt - now) / (1000 * 60 * 60 * 24));
  return daysLeft > 0 && daysLeft <= 7;
};

// Check if extra period is ending soon (5 days or less — reminder period)
UserSchema.methods.isExtraPeriodExpiringSoon = function () {
  if (this.subscriptionStatus !== 'extra' || !this.extraDaysEndsAt) return false;
  const now = new Date();
  const daysLeft = Math.ceil((this.extraDaysEndsAt - now) / (1000 * 60 * 60 * 24));
  return daysLeft > 0 && daysLeft <= 5;
};

// Check if subscription is ending soon
UserSchema.methods.isSubscriptionExpiringSoon = function () {
  if (this.subscriptionStatus !== 'active' || !this.subscriptionEndsAt) return false;
  const now = new Date();
  const daysLeft = Math.ceil((this.subscriptionEndsAt - now) / (1000 * 60 * 60 * 24));
  return daysLeft > 0 && daysLeft <= 7;
};

// Mark reminder as sent for today
UserSchema.methods.markExtraReminderSent = function () {
  this.extraReminderSentAt = new Date();
};

// Should we send extra period reminder today?
UserSchema.methods.shouldSendExtraReminder = function () {
  if (!this.isExtraPeriodExpiringSoon()) return false;
  if (!this.extraReminderSentAt) return true;
  
  const now = new Date();
  const lastSent = new Date(this.extraReminderSentAt);
  // Check if last sent was today (same day)
  return lastSent.getDate() !== now.getDate() || 
         lastSent.getMonth() !== now.getMonth() || 
         lastSent.getFullYear() !== now.getFullYear();
};

module.exports = mongoose.model('User', UserSchema);
