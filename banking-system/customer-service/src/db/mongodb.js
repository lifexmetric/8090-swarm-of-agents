const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/customers_db';

async function connect() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log(`[MongoDB] Connected to ${MONGODB_URI}`);
  } catch (err) {
    console.error('[MongoDB] Connection failed:', err.message);
    throw err;
  }
}

async function disconnect() {
  try {
    await mongoose.disconnect();
    console.log('[MongoDB] Disconnected');
  } catch (err) {
    console.error('[MongoDB] Disconnect error:', err.message);
    throw err;
  }
}

mongoose.connection.on('disconnected', () => {
  console.warn('[MongoDB] Connection lost');
});

mongoose.connection.on('reconnected', () => {
  console.log('[MongoDB] Reconnected');
});

module.exports = { connect, disconnect };
