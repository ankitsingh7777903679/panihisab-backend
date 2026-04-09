const mongoose = require('mongoose');

/**
 * SystemSettings: Global configuration for the entire PaniHisab system
 * Controls subscription mode, trial periods, and system-wide features
 */
const SystemSettingsSchema = new mongoose.Schema(
  {
    // System Mode: 'pending' = unlimited free for all, 'active' = trial/subscription mode active
    subscriptionMode: {
      type: String,
      enum: ['pending', 'active'],
      default: 'pending',
    },
    
    // When admin activated the trial system
    trialStartedAt: {
      type: Date,
      default: null,
    },
    
    // Admin who activated the system
    activatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    
    // Default trial days when system activates
    defaultTrialDays: {
      type: Number,
      default: 30,
    },
    
    // Default extra days after trial
    defaultExtraDays: {
      type: Number,
      default: 10,
    },
    
    // System message for users during pending mode
    pendingModeMessage: {
      type: String,
      default: 'Welcome! Enjoy unlimited free access. Trial period will begin soon.',
    },
    
    // Notes for admin
    adminNotes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

// Singleton pattern - only one settings document should exist
SystemSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

// Check if subscription system is active
SystemSettingsSchema.statics.isSubscriptionActive = async function() {
  const settings = await this.getSettings();
  return settings.subscriptionMode === 'active';
};

// Activate system (admin clicks start)
SystemSettingsSchema.statics.activateSystem = async function(adminId) {
  const settings = await this.getSettings();
  settings.subscriptionMode = 'active';
  settings.trialStartedAt = new Date();
  settings.activatedBy = adminId;
  await settings.save();
  return settings;
};

module.exports = mongoose.model('SystemSettings', SystemSettingsSchema);
