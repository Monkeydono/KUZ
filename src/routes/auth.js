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

    // กรองเฉพาะ @ku.th และ @ku.ac.th
    const lower = email.toLowerCase();
    if (!lower.endsWith('@ku.th') && !lower.endsWith('@ku.ac.th')) {
      return done(null, false, { message: 'กรุณาใช้ email @ku.th หรือ @ku.ac.th เท่านั้น' });
    }

    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const role = adminEmails.includes(email.toLowerCase()) ? 'admin' : 'student';

    // Google access token มีอายุ ~1 ชม. — เก็บ expiry เพื่อ proactive refresh
    const expiresAt = new Date(Date.now() + 55 * 60 * 1000);

    // upsert user + เก็บ tokens เสมอ
    // refresh_token จะมาเฉพาะตอน user accept consent — COALESCE กัน null override ของเดิม
    const result = await pool.query(
      `INSERT INTO users (email, name, role,
                          google_access_token, google_refresh_token, google_token_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         role = EXCLUDED.role,
         google_access_token = EXCLUDED.google_access_token,
         google_refresh_token = COALESCE(EXCLUDED.google_refresh_token, users.google_refresh_token),
         google_token_expires_at = EXCLUDED.google_token_expires_at
       RETURNING *`,
      [email, profile.displayName, role, accessToken, refreshToken || null, expiresAt]
    );

    return done(null, result.rows[0]);
  } catch (err) {
    return done(err);
  }
}));

// เริ่ม Google login — request scope รวม Calendar + Drive (drive.file = app-created files only)
// accessType: offline + prompt: consent → บังคับให้ได้ refresh_token เสมอ
router.get('/google',
  passport.authenticate('google', {
    scope: [
      'profile',
      'email',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/drive.file',
    ],
    accessType: 'offline',
    prompt: 'consent',
  })
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
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  res.redirect(`${frontendUrl}/login?error=domain`);
});

const authenticate = require('../middleware/authenticate');

// GET /auth/me — frontend ใช้รู้ role ปัจจุบัน + เช็คว่า user grant calendar scope แล้ว
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT (google_refresh_token IS NOT NULL) AS has_calendar
         FROM users WHERE id = $1`,
      [req.user.id]
    );
    res.json({ ...req.user, has_calendar: r.rows[0]?.has_calendar || false });
  } catch (err) { next(err); }
});

module.exports = router;