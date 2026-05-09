const redis = require('redis');

const client = redis.createClient({
  url: process.env.REDIS_URI || 'redis://localhost:6379'
});

client.on('error', (err) => console.log('Redis Client Error', err));
client.on('connect', () => console.log('✅ Redis connected successfully.'));

(async () => {
  try {
    await client.connect();
  } catch (error) {
    console.error('Failed to connect to Redis', error);
  }
})();

module.exports = client;
