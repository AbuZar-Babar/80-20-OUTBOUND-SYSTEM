const mongoose = require('mongoose');

const connectDB = async () => {
  const customUri = process.env.MONGODB_URI;

  // 1. If explicit MONGODB_URI is provided in .env
  if (customUri && customUri.trim() !== '') {
    try {
      const conn = await mongoose.connect(customUri, { serverSelectionTimeoutMS: 4000 });
      console.log(`[MongoDB] Connected to configured URI: ${conn.connection.host}`);
      return;
    } catch (err) {
      console.warn(`[MongoDB] Failed to connect to MONGODB_URI (${err.message}). Falling back to local/in-memory Mongo...`);
    }
  }

  // 2. Try connecting to local default MongoDB instance
  try {
    const conn = await mongoose.connect('mongodb://localhost:27017/caller-app', { serverSelectionTimeoutMS: 2500 });
    console.log(`[MongoDB] Connected to local MongoDB instance: ${conn.connection.host}`);
    return;
  } catch (localErr) {
    console.log('[MongoDB] Local MongoDB server not detected on localhost:27017.');
  }

  // 3. Automated In-Memory Fallback using mongodb-memory-server
  try {
    console.log('[MongoDB] Initializing automated In-Memory Mongo Database...');
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    const mongoUri = mongod.getUri();
    
    const conn = await mongoose.connect(mongoUri);
    console.log(`[MongoDB Memory Server] Connected successfully to In-Memory DB: ${conn.connection.host}`);
  } catch (memoryErr) {
    console.error(`[MongoDB] Critical Database Connection Failure: ${memoryErr.message}`);
  }
};

module.exports = connectDB;
