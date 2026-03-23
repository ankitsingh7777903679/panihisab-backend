require('dotenv').config();
const mongoose = require('mongoose');

const migrate = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected...');

    // Drop the users collection to reset the schema
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const usersCollectionExists = collections.some(c => c.name === 'users');
    
    if (usersCollectionExists) {
      await db.collection('users').drop();
      console.log('✅ Users collection dropped');
    } else {
      console.log('Users collection does not exist, creating fresh...');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error.message);
    process.exit(1);
  }
};

migrate();
