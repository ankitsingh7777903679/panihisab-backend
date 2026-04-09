const cron = require('node-cron');
const User = require('../models/User');

/**
 * Cron job: Send reminders to users in extra period (last 5 days)
 * Runs once per day at 10:00 AM
 */
const startReminderCron = () => {
  // Run daily at 10:00 AM
  cron.schedule('0 10 * * *', async () => {
    console.log('⏰ [CRON] Running extra period reminder check...');
    
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    try {
      // Find users in extra period with 1-5 days remaining
      const usersNeedingReminder = await User.find({
        subscriptionStatus: 'extra',
        extraDaysEndsAt: {
          $gt: now, // Not yet expired
          $lte: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000) // Expiring within 5 days
        }
      }).select('name mobile email businessName extraDaysEndsAt extraReminderSentAt');

      for (const user of usersNeedingReminder) {
        // Check if we should send reminder (not sent today already)
        if (!user.shouldSendExtraReminder()) {
          continue;
        }

        const daysLeft = Math.ceil((user.extraDaysEndsAt - now) / (1000 * 60 * 60 * 24));
        
        // Send reminder (implement your notification service here)
        await sendExtraPeriodReminder(user, daysLeft);
        
        // Mark as sent
        user.markExtraReminderSent();
        await user.save();
        
        console.log(`✅ Reminder sent to ${user.mobile} (${daysLeft} days left)`);
      }

      console.log(`⏰ [CRON] Sent ${usersNeedingReminder.length} reminders`);
    } catch (error) {
      console.error('❌ [CRON] Reminder job failed:', error.message);
    }
  }, {
    timezone: 'Asia/Kolkata' // Indian timezone
  });

  console.log('✅ Reminder cron job scheduled (daily at 10:00 AM IST)');
};

/**
 * Send reminder notification to user
 * Implement SMS/WhatsApp/Email here
 */
const sendExtraPeriodReminder = async (user, daysLeft) => {
  const message = `🚨 PaniHisab Alert: Your free trial extra period ends in ${daysLeft} day${daysLeft > 1 ? 's' : ''}!\n\n` +
    `⏰ Extra period ends: ${user.extraDaysEndsAt.toLocaleDateString('en-IN')}\n\n` +
    `👉 Subscribe now at ₹299/month (up to 200 customers) to continue using all features.\n\n` +
    `Pay now to avoid service interruption.\n\n` +
    `- Team PaniHisab`;

  // TODO: Implement actual notification
  // Options:
  // 1. SMS via Twilio/Fast2SMS
  // 2. WhatsApp via WhatsApp Business API
  // 3. Email via SendGrid/AWS SES
  // 4. Push notification via Firebase
  
  console.log(`📨 To: ${user.mobile}`);
  console.log(`📨 Message: ${message}`);
  
  // Example: Send via your preferred service
  // await sendSMS(user.mobile, message);
  // await sendWhatsApp(user.mobile, message);
  // await sendEmail(user.email, 'PaniHisab: Subscription Expiring Soon', message);
};

module.exports = { startReminderCron };
