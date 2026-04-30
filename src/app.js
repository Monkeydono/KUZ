const express = require('express');
const passport = require('passport');
const cors = require('cors');
const app = express();
require('dotenv').config();

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set in environment');
}

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

const authRoutes    = require('./routes/auth');
const bookingRoutes = require('./routes/bookings');
const adminRoutes   = require('./routes/admin');
const authenticate  = require('./middleware/authenticate');

app.use('/auth', authRoutes);
app.use('/bookings', authenticate, bookingRoutes);
app.use('/admin',    authenticate, adminRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

module.exports = app;