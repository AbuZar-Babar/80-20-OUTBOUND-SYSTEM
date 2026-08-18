const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri || mongoUri.trim() === '') {
    console.log('[MongoDB] No MONGODB_URI provided. MongoDB will NOT be used.');
    return false;
  }

  try {
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    isConnected = true;
    console.log(`[MongoDB] Connected to Atlas: ${conn.connection.host}/${conn.connection.name}`);
    return true;
  } catch (err) {
    console.error(`[MongoDB] Connection failed: ${err.message}`);
    console.log('[MongoDB] Falling back to Zero-DB local store.');
    return false;
  }
};

const isMongoConnected = () => isConnected;

module.exports = { connectDB, isMongoConnected };
