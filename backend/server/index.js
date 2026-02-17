require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { connectDB } = require('../config/db');
const { generalLimiter, authLimiter } = require('../middleware/rateLimit');
const authRoutes = require('../routes/auth');
const channelRoutes = require('../routes/channels');
const expenseRoutes = require('../routes/expenses');
const settlementRoutes = require('../routes/settlements');

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '100kb' }));
app.use(cors({
  origin: FRONTEND_ORIGIN.split(',').map(s => s.trim()),
  credentials: true,
}));
app.use(generalLimiter);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/channels', expenseRoutes);
app.use('/api/channels', settlementRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

async function start() {
  try {
    await connectDB();
  } catch (e) {
    console.error('DB connect failed:', e.message);
  }
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

start();
