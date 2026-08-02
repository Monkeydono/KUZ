const express = require('express');
const passport = require('passport');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const app = express();
require('dotenv').config();

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set in environment');
}

// running behind Nginx — trust 1 proxy so req.ip / X-Forwarded-For work for rate-limit
app.set('trust proxy', 1);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

// เกิน limit ตอน browser navigate มา /auth/google หรือ /auth/kulogin ตรงๆ
// → เด้งกลับหน้า login พร้อมข้อความ แทนที่จะโชว์ "Too many requests" เปล่าๆ ให้ user งง
function rateLimitHandler(req, res) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  console.warn(`[rate-limit] ${req.method} ${req.originalUrl} blocked for ip=${req.ip}`);
  if (req.method === 'GET' && req.accepts('html')) {
    return res.redirect(`${frontendUrl}/login?error=ratelimit`);
  }
  res.status(429).json({ error: 'มีคำขอเข้ามามากเกินไป กรุณารอสักครู่แล้วลองใหม่' });
}

// NOTE: limit นับต่อ req.ip — ผู้ใช้ KU จำนวนมากออกเน็ตผ่าน NAT ตัวเดียวกัน
// เลข limit จึงต้องเผื่อทั้งวิทยาเขต ไม่ใช่ต่อคน
// และถ้า Nginx ไม่ได้ set X-Forwarded-For ทุก request จะกลายเป็น 127.0.0.1 ก้อนเดียว
// → ทั้งมหาลัยแชร์ budget เดียว แล้ว login จะพังพร้อมกันทั้ง Google และ KU
// เช็คได้ที่ GET /health → field "ip" ต้องเป็น IP จริงของ client ไม่ใช่ 127.0.0.1
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

const authRoutes          = require('./routes/auth');
const bookingRoutes       = require('./routes/bookings');
const adminRoutes         = require('./routes/admin');
const notificationRoutes  = require('./routes/notifications');
const zoomWebhookRoutes   = require('./routes/zoomWebhook');
const authenticate        = require('./middleware/authenticate');

// Zoom webhook (ไม่ผ่าน authenticate — verify ด้วย signature ใน route เอง)
app.use('/webhooks', zoomWebhookRoutes);

// /auth/me ถูกเรียกทุกครั้งที่โหลดหน้า (useUser) — ปริมาณสูงกว่า login มาก
// ถ้าใช้ budget ก้อนเดียวกับ login พอ budget หมด ปุ่ม login จะพังพร้อมกันทั้ง 2 แบบ
// → แยกให้ /auth/me ไปใช้ apiLimiter เหมือน endpoint อื่นที่เรียกบ่อย
const authPathLimiter = (req, res, next) =>
  (req.path === '/me' ? apiLimiter : authLimiter)(req, res, next);

app.use('/auth',          authPathLimiter, authRoutes);
app.use('/bookings',      apiLimiter, authenticate, bookingRoutes);
app.use('/admin',         apiLimiter, authenticate, adminRoutes);
app.use('/notifications', apiLimiter, authenticate, notificationRoutes);

// ip = req.ip ที่ express resolve ได้จริง — ใช้ยืนยันว่า trust proxy + X-Forwarded-For ทำงาน
// ถ้าเรียกจากเครื่องข้างนอกแล้วได้ 127.0.0.1 แปลว่า Nginx ไม่ได้ส่ง X-Forwarded-For มา
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date(), ip: req.ip });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

module.exports = app;
