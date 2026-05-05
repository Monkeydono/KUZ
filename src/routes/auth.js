const express = require('express');
const router = express.Router();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const pool = require('../../config/db');
require('dotenv').config();

// ตั้งค่า Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL:  process.env.GOOGLE_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails[0].value;

    // กรองเฉพาะ @ku.th
    if (!email.endsWith('@ku.th')) {
      return done(null, false, { message: 'กรุณาใช้ email @ku.th เท่านั้น' });
    }

    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const role = adminEmails.includes(email.toLowerCase()) ? 'admin' : 'student';

    // upsert user — sync role ทุกครั้งที่ login เพื่อให้ env เป็น source of truth
    const result = await pool.query(
      `INSERT INTO users (email, name, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = $2, role = $3
       RETURNING *`,
      [email, profile.displayName, role]
    );

    return done(null, result.rows[0]);
  } catch (err) {
    return done(err);
  }
}));

// เริ่ม Google login
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Callback หลัง Google login
router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/auth/failed' }),
  (req, res) => {
    // สร้าง JWT
    const token = jwt.sign(
      { id: req.user.id, email: req.user.email, role: req.user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // ใช้ fragment (#) แทน query (?) — fragment ไม่ติด server log/Referer/history
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/#token=${token}`);
  }
);

router.get('/failed', (req, res) => {
  res.status(401).json({ error: 'กรุณาใช้ email @ku.th เท่านั้น' });
});

const authenticate = require('../middleware/authenticate');

// GET /auth/me — frontend ใช้รู้ role ปัจจุบัน (จาก DB ผ่าน middleware)
router.get('/me', authenticate, (req, res) => {
  res.json(req.user);
});

module.exports = router;