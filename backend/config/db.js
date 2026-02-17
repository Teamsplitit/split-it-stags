const mongoose = require('mongoose');

// Declare variable for MongoDB connection - add your DSN in .env as MONGODB_URI
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.warn('MONGODB_URI is not set. Set it in .env to connect to MongoDB.');
}

async function connectDB() {
  if (!MONGODB_URI) return null;
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB connected');
    return mongoose.connection;
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    throw err;
  }
}

module.exports = { connectDB, mongoose };
