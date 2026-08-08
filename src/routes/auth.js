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
    //
    // role: ห้าม override ของเดิม — ไม่งั้นคนที่ admin ตั้งเป็น staff/priority/admin ผ่าน UI
    // จะถูก reset กลับเป็น student ทุกครั้งที่ login ($3 เป็น student สำหรับทุกคนที่ไม่ได้อยู่ใน ADMIN_EMAILS)
    // ยกเว้น ADMIN_EMAILS → บังคับเป็น admin เสมอ (bootstrap ไว้กู้สิทธิ์ตัวเองได้)
    // $3::text ใช้ได้ทั้งกรณี role เป็น ENUM user_role และ VARCHAR
    const result = await pool.query(
      `INSERT INTO users (email, name, role,
                          google_access_token, google_refresh_token, google_token_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         role = CASE WHEN $3::text = 'admin' THEN EXCLUDED.role ELSE users.role END,
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

// ตรวจ env ให้ครบก่อนเด้งไป Google — ถ้าขาด passport จะโยน error ดิบออกมาให้ user เห็น
// (ต้องอยู่ก่อน route /google และครอบ /google/callback ด้วย)
router.use('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_CALLBACK_URL) {
    console.error('[auth] Google OAuth env ไม่ครบ — ตรวจ GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_CALLBACK_URL');
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/login?error=google_unconfigured`);
  }
  next();
});

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
// prod: KU_LOGIN_REDIRECT_URI = https://meet.ocs.ku.ac.th/calendar (หน้า React ไม่ใช่ backend)
//
// PKCE verifier เก็บใน memory keyed by state, TTL 5 นาที
// ⚠️ ใช้ได้เฉพาะ pm2 แบบ instance เดียว — ถ้ารัน cluster mode หลาย worker
// authorize กับ exchange จะคนละ process แล้ว Map ว่างเสมอ → invalid_state ทุกครั้ง
const kuFlows = new Map();
const PM2_INSTANCE = process.env.NODE_APP_INSTANCE ?? process.env.pm_id ?? '-';
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
  // log config ที่ส่งไปจริง — ถ้า Keycloak ตอบ "Client not found" หรือ "Invalid redirect_uri"
  // จะได้เทียบกับที่ OCS ลงทะเบียนไว้ได้ทันทีจาก pm2 log (ไม่มี secret ปนออกมา)
  console.log('[kulogin] authorize →', JSON.stringify(kuLogin.describeConfig()));
  res.redirect(kuLogin.buildAuthorizeUrl({ state, codeChallenge: challenge }));
});

// redirect_uri ที่ลงทะเบียน = /calendar (หน้า React) → frontend ส่ง code+state มา exchange ที่นี่
// คืน JWT เป็น JSON (ไม่ redirect) เพราะ caller คือ frontend ผ่าน axios
router.post('/kulogin/exchange', async (req, res) => {
  try {
    const { code, state } = req.body;
    const flow = state && kuFlows.get(state);
    if (!code || !flow) {
      // flows_in_memory=0 ทั้งที่เพิ่งกด login → เกือบแน่ว่า pm2 รัน cluster mode
      // (หรือ backend restart คั่นกลาง / ใช้เวลา login เกิน 5 นาที)
      console.error('[kulogin exchange] invalid_state —',
        `has_code=${Boolean(code)} has_state=${Boolean(state)}`,
        `flow_found=${Boolean(flow)} flows_in_memory=${kuFlows.size}`,
        `pm2_instance=${PM2_INSTANCE}`);
      return res.status(400).json({ error: 'invalid_state' });
    }
    kuFlows.delete(state);

    const tokens = await kuLogin.exchangeCode(code, flow.verifier);
    const info = await kuLogin.fetchUserInfo(tokens.access_token);

    // ใช้ google-mail (@ku.th) เป็น key หลัก → user เดียวกับ Google login
    const email = (info['google-mail'] || info.mail || info.email || '').toLowerCase();
    if (!email.endsWith('@ku.th') && !email.endsWith('@ku.ac.th')) {
      // scope ที่ OCS ให้มา (basic openid) อาจไม่ปล่อย claim อีเมลมาเลย
      // log ชื่อ claim ที่ได้จริง เพื่อเทียบกับคู่มือ OCS ว่าต้องขอ scope อะไรเพิ่ม
      console.error('[kulogin exchange] domain reject —',
        `resolved_email=${JSON.stringify(email)}`,
        `claims_received=${JSON.stringify(Object.keys(info))}`);
      return res.status(403).json({ error: 'ku_domain' });
    }

    const name = info.thainame || info.cn || info.name || email;
    const typePerson = info['type-person'] != null ? String(info['type-person']) : null;

    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const role = adminEmails.includes(email) ? 'admin' : 'student';

    // role: preserve ของเดิมเหมือนฝั่ง Google — ดูคอมเมนต์ใน GoogleStrategy
    const result = await pool.query(
      `INSERT INTO users (email, name, role, ku_type_person)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         role = CASE WHEN $3::text = 'admin' THEN EXCLUDED.role ELSE users.role END,
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
    // ส่ง id_token กลับด้วย → frontend ใช้เป็น id_token_hint ตอน logout SSO
    res.json({ token, idToken: tokens.id_token || null });
  } catch (err) {
    // แยกให้ชัดว่าพังตอน exchange code หรือตอน fetch userinfo
    const step = err.config?.url?.includes('/token') ? 'token_exchange'
               : err.config?.url?.includes('/userinfo') ? 'userinfo'
               : 'unknown';
    console.error(`[kulogin exchange] failed at ${step} (pm2_instance=${PM2_INSTANCE}) —`,
      `status=${err.response?.status}`,
      JSON.stringify(err.response?.data || err.message));
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

// error handler เฉพาะ /auth — error ที่หลุดจาก passport/OIDC (เช่น invalid_client, DB ล่ม)
// จะตกไป error handler กลางแล้วพ่น JSON ดิบใส่หน้า browser ระหว่าง OAuth redirect
// → ดักไว้เด้งกลับหน้า login พร้อม error code แทน (รายละเอียดจริงอยู่ใน pm2 log)
router.use((err, req, res, next) => {
  console.error('[auth error]', req.method, req.originalUrl, '—', err.message);
  console.error(err.stack);
  if (req.method === 'GET' && req.accepts('html')) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/login?error=server`);
  }
  next(err);
});

module.exports = router;