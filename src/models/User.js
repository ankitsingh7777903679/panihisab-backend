const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
      enum: ['trial', 'active', 'expired', 'canceled'],
      default: 'trial',
    },
    trialStartsAt:      { type: Date, default: Date.now },
    trialEndsAt:        { type: Date },          // auto-set 30 days after creation
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

// Auto-set trialEndsAt = 30 days from now (only on first creation)
UserSchema.pre('validate', async function () {
  if (this.isNew && !this.trialEndsAt) {
    const trialEnd = new Date(this.trialStartsAt || Date.now());
    trialEnd.setDate(trialEnd.getDate() + 30);
    this.trialEndsAt = trialEnd;
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
UserSchema.methods.hasActiveSubscription = function () {
  const now = new Date();
  if (this.subscriptionStatus === 'trial' && this.trialEndsAt > now) return true;
  if (this.subscriptionStatus === 'active' && this.subscriptionEndsAt > now) return true;
  return false;
};

// Get subscription details with days remaining
UserSchema.methods.getSubscriptionDetails = function () {
  const now = new Date();
  let endDate = null;
  let daysLeft = 0;
  let isExpiringSoon = false; // expiring within 7 days
  let reason = '';

  if (this.subscriptionStatus === 'trial') {
    if (this.trialEndsAt) {
      endDate = this.trialEndsAt;
      daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
      isExpiringSoon = daysLeft > 0 && daysLeft <= 7;
      if (daysLeft <= 0) {
        reason = 'Trial period has ended';
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
    isExpiringSoon,
    isActive: this.hasActiveSubscription(),
    reason,
    message: reason || (this.hasActiveSubscription() ? 'Active' : 'Not active'),
  };
};

// Check if trial is ending soon (7 days or less)
UserSchema.methods.isTrialExpiringSoon = function () {
  if (this.subscriptionStatus !== 'trial' || !this.trialEndsAt) return false;
  const now = new Date();
  const daysLeft = Math.ceil((this.trialEndsAt - now) / (1000 * 60 * 60 * 24));
  return daysLeft > 0 && daysLeft <= 7;
};

// Check if subscription is ending soon
UserSchema.methods.isSubscriptionExpiringSoon = function () {
  if (this.subscriptionStatus !== 'active' || !this.subscriptionEndsAt) return false;
  const now = new Date();
  const daysLeft = Math.ceil((this.subscriptionEndsAt - now) / (1000 * 60 * 60 * 24));
  return daysLeft > 0 && daysLeft <= 7;
};

module.exports = mongoose.model('User', UserSchema);
