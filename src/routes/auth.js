const express = require('express');
const router = express.Router();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../../config/db');
const kuLogin = require('../services/kuLoginService');
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

// ===== KU ALL-Login (OIDC / Keycloak) =====
// redirect_uri ต้องตรงเป๊ะกับที่ลงทะเบียนกับ OCS
// ใช้ KU_LOGIN_REDIRECT_URI = https://meet.ocs.ku.ac.th/auth/kulogin/callback
// PKCE verifier เก็บชั่วคราว keyed by state (single PM2 instance, TTL 5 นาที)
const kuFlows = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [s, v] of kuFlows) if (now - v.at > 5 * 60 * 1000) kuFlows.delete(s);
}, 60 * 1000).unref();

router.get('/kulogin', (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  if (!kuLogin.isConfigured()) {
    return res.redirect(`${frontendUrl}/login?error=kulogin_unconfigured`);
  }
  const state = crypto.randomBytes(16).toString('hex');
  const { verifier, challenge } = kuLogin.generatePKCE();
  kuFlows.set(state, { verifier, at: Date.now() });
  res.redirect(kuLogin.buildAuthorizeUrl({ state, codeChallenge: challenge }));
});

// redirect_uri ที่ลงทะเบียน = /calendar (หน้า React) → frontend ส่ง code+state มา exchange ที่นี่
// คืน JWT เป็น JSON (ไม่ redirect) เพราะ caller คือ frontend ผ่าน axios
router.post('/kulogin/exchange', async (req, res) => {
  try {
    const { code, state } = req.body;
    const flow = state && kuFlows.get(state);
    if (!code || !flow) return res.status(400).json({ error: 'invalid_state' });
    kuFlows.delete(state);

    const tokens = await kuLogin.exchangeCode(code, flow.verifier);
    const info = await kuLogin.fetchUserInfo(tokens.access_token);

    // ใช้ google-mail (@ku.th) เป็น key หลัก → user เดียวกับ Google login
    const email = (info['google-mail'] || info.mail || info.email || '').toLowerCase();
    if (!email.endsWith('@ku.th') && !email.endsWith('@ku.ac.th')) {
      return res.status(403).json({ error: 'domain' });
    }

    const name = info.thainame || info.cn || info.name || email;
    const typePerson = info['type-person'] != null ? String(info['type-person']) : null;

    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const role = adminEmails.includes(email) ? 'admin' : 'student';

    const result = await pool.query(
      `INSERT INTO users (email, name, role, ku_type_person)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         role = EXCLUDED.role,
         ku_type_person = EXCLUDED.ku_type_person
       RETURNING *`,
      [email, name, role, typePerson]
    );
    const user = result.rows[0];

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token });
  } catch (err) {
    console.error('[kulogin exchange]', err.response?.data || err.message);
    res.status(500).json({ error: 'kulogin_failed' });
  }
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