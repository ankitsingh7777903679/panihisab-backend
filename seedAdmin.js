require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected for seeding...');

    const adminEmail = 'admin@panihisab.com';
    const adminPassword = 'admin123';

    // Delete existing admin if present to fix double-hashing bug
    await User.deleteOne({ email: adminEmail });

    const adminUser = new User({
      name: 'Super Admin',
      mobile: '9999999999',
      email: adminEmail,
      password: adminPassword, // The pre-save hook in User model will hash this automatically!
      businessName: 'PaniHisab Platform',
      role: 'admin',
      isActive: true,
    });

    await adminUser.save();
    console.log(`✅ Admin successfully created (fixed hashing)!`);
    console.log(`Email: ${adminEmail}`);
    console.log(`Password: ${adminPassword}`);
    process.exit(0);

  } catch (error) {
    console.error('Error seeding admin:', error.message);
    process.exit(1);
  }
};

seedAdmin();
