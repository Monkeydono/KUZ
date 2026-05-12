const express = require('express');
const passport = require('passport');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
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

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

const authRoutes          = require('./routes/auth');
const bookingRoutes       = require('./routes/bookings');
const adminRoutes         = require('./routes/admin');
const notificationRoutes  = require('./routes/notifications');
const zoomWebhookRoutes   = require('./routes/zoomWebhook');
const authenticate        = require('./middleware/authenticate');

// Zoom webhook (ไม่ผ่าน authenticate — verify ด้วย signature ใน route เอง)
app.use('/webhooks', zoomWebhookRoutes);

app.use('/auth',          authLimiter, authRoutes);
app.use('/bookings',      apiLimiter, authenticate, bookingRoutes);
app.use('/admin',         apiLimiter, authenticate, adminRoutes);
app.use('/notifications', apiLimiter, authenticate, notificationRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

module.exports = app;
