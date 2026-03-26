const mongoose = require('mongoose');

const seedAdmin = async () => {
  try {
    // Lazy-require to avoid circular deps
    const User = require('../models/User');

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@panihisab.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    const exists = await User.findOne({ role: 'admin' });
    if (exists) return; // already seeded, skip

    const admin = new User({
      name: 'Super Admin',
      mobile: '9999999999',
      email: adminEmail,
      password: adminPassword,
      businessName: 'PaniHisab Platform',
      role: 'admin',
      isActive: true,
    });

    await admin.save();
    console.log(`✅ Admin seeded → ${adminEmail}`);
  } catch (err) {
    console.error('⚠️  Admin seed error:', err.message);
  }
};

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    await seedAdmin(); // auto-seed admin on every startup
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
