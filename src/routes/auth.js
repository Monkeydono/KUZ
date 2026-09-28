const express = require('express');
const router = express.Router();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../../config/db');
const kuLogin = require('../services/kuLoginService');
require('dotenv').config();

// token จำไว้ในเครื่องผู้ใช้ (localStorage) — ใช้งานต่อเนื่องได้โดยไม่ต้องล็อกอินใหม่
// /auth/me ต่ออายุให้อัตโนมัติ (sliding) → หายไปนานเกิน JWT_EXPIRES_IN ถึงต้องล็อกอินใหม่
// ปลอดภัยพอเพราะ authenticate ดึง role จาก DB ทุก request — ถอนสิทธิ์มีผลทันที
const TOKEN_TTL = process.env.JWT_EXPIRES_IN || '30d';
const TOKEN_RENEW_AFTER_SEC = 24 * 60 * 60;

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

function isAdminEmail(email) {
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return adminEmails.includes((email || '').toLowerCase());
}

// ===== Google (ขั้นที่ 2 หลัง KU ALL-Login เท่านั้น) =====
// ผู้ใช้เข้าสู่ระบบด้วย KU ALL-Login อย่างเดียว แล้วระบบพาไปเชื่อมบัญชี Google เพื่อใช้ Calendar/Drive
// กันการเข้า Google ตรง ๆ ด้วย "ตั๋วเชื่อมบัญชี" (JWT อายุสั้น) ที่ออกให้หลัง KU ALL-Login สำเร็จ
//   - ตั๋วระบุอีเมลของบัญชีนนทรี → บัญชี Google ต้องเป็นอีเมลเดียวกัน
//   - บัญชี Google ต้องเป็น KU Google Workspace (hd = ku.th) ไม่รับ Gmail ส่วนตัว
// เครื่อง dev ที่ REQUIRE_KU_PROFILE=false (KU ALL-Login ใช้ไม่ได้เพราะ redirect_uri) ยังเข้า Google ตรงได้
const KU_WORKSPACE_DOMAIN = 'ku.th';
const LINK_TICKET_TTL = '15m';

function issueLinkTicket(user) {
  return jwt.sign(
    { purpose: 'google_link', id: user.id, email: user.email.toLowerCase() },
    process.env.JWT_SECRET,
    { expiresIn: LINK_TICKET_TTL }
  );
}

function verifyLinkTicket(ticket) {
  try {
    const t = jwt.verify(ticket, process.env.JWT_SECRET);
    return t.purpose === 'google_link' ? t : null;
  } catch (e) {
    return null;
  }
}

const googleDirectAllowed = () => !kuLogin.isProfileRequired();

// state ที่ส่งไปกับ Google แล้วได้คืนที่ callback: "<flags>|<ticket>"
//   flags: consent = รอบนี้บังคับหน้าอนุญาตสิทธิ์แล้ว (กันวน redirect)
function packState({ consent, ticket }) {
  return `${consent ? 'consent' : ''}|${ticket || ''}`;
}
function unpackState(s) {
  const [flags = '', ticket = ''] = typeof s === 'string' ? s.split('|') : [];
  return { consent: flags.split(',').includes('consent'), ticket: ticket || null };
}

// URL สาธารณะของ backend สร้างจาก GOOGLE_CALLBACK_URL (รองรับกรณี Nginx มี path prefix)
// เช่น https://meet.ocs.ku.ac.th/api/auth/google/callback → https://meet.ocs.ku.ac.th/api/auth
const authBase = () => process.env.GOOGLE_CALLBACK_URL.replace(/\/google\/callback\/?$/, '');

// เหตุผลที่ไม่ให้ผ่าน → ส่งกลับเป็น info.code แล้ว callback แปลงเป็น ?error= ของหน้า login
passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL:  process.env.GOOGLE_CALLBACK_URL,
  passReqToCallback: true,
}, async (req, accessToken, refreshToken, profile, done) => {
  try {
    const email = (profile.emails?.[0]?.value || '').toLowerCase();
    const hostedDomain = profile._json?.hd;

    // ต้องเป็นบัญชี KU Google Workspace เท่านั้น
    if (hostedDomain !== KU_WORKSPACE_DOMAIN || !email.endsWith(`@${KU_WORKSPACE_DOMAIN}`)) {
      return done(null, false, { code: 'google_workspace' });
    }

    const { ticket } = unpackState(req.query.state);
    const linked = ticket ? verifyLinkTicket(ticket) : null;
    if (ticket && !linked) return done(null, false, { code: 'link_expired' });
    if (!linked && !googleDirectAllowed()) return done(null, false, { code: 'need_kulogin' });
    // เลือกบัญชี Google คนละอีเมลกับบัญชีนนทรีที่ผ่าน KU ALL-Login มา
    if (linked && linked.email !== email) return done(null, false, { code: 'google_mismatch' });

    const role = isAdminEmail(email) ? 'admin' : 'student';

    // Google access token มีอายุ ~1 ชม. — เก็บ expiry เพื่อ proactive refresh
    const expiresAt = new Date(Date.now() + 55 * 60 * 1000);

    // upsert user + เก็บ tokens เสมอ
    // refresh_token จะมาเฉพาะตอน user accept consent — COALESCE กัน null override ของเดิม
    //
    // role: ห้าม override ของเดิม — ไม่งั้นคนที่ admin ตั้งเป็น staff/priority/admin ผ่าน UI
    // จะถูก reset กลับเป็น student ทุกครั้งที่ login ($3 เป็น student สำหรับทุกคนที่ไม่ได้อยู่ใน ADMIN_EMAILS)
    // ยกเว้น ADMIN_EMAILS → บังคับเป็น admin เสมอ (bootstrap ไว้กู้สิทธิ์ตัวเองได้)
    // name: ใช้ชื่อจาก KU ALL-Login ถ้ามีแล้ว (ชื่อภาษาไทยตามทะเบียน) — Google ใช้เฉพาะผู้ใช้ใหม่
    // $3::text ใช้ได้ทั้งกรณี role เป็น ENUM user_role และ VARCHAR
    const result = await pool.query(
      `INSERT INTO users (email, name, role,
                          google_access_token, google_refresh_token, google_token_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO UPDATE SET
         name = CASE WHEN users.ku_profile_at IS NOT NULL THEN users.name ELSE EXCLUDED.name END,
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

// GET /auth/config — หน้า login ใช้ตัดสินใจว่าจะแสดงปุ่ม Google ตรงไหม (เฉพาะเครื่อง dev)
router.get('/config', (req, res) => {
  res.json({ googleDirectLogin: googleDirectAllowed() });
});

// เริ่มเชื่อมบัญชี Google — request scope รวม Calendar + Drive (drive.file = app-created files only)
// ?ticket=<ตั๋วเชื่อมบัญชี> จำเป็น ยกเว้นเครื่อง dev
// ?consent=1 → บังคับหน้าขออนุญาตสิทธิ์ เพื่อให้ได้ refresh_token ใหม่
//
// ไม่บังคับหน้าขออนุญาตทุกครั้ง: คนที่เคยอนุญาตแล้ว Google จะข้ามหน้านั้นให้
// ผลคือ Google ไม่ส่ง refresh_token มาอีก แต่เรามีของเดิมเก็บไว้แล้ว (COALESCE ใน strategy)
// ถ้าไม่มีของเดิม callback จะวนกลับมาที่ ?consent=1 เอง
router.get('/google', (req, res, next) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : null;
  const linked = ticket ? verifyLinkTicket(ticket) : null;
  if (ticket && !linked) return res.redirect(`${frontendUrl}/login?error=link_expired`);
  if (!linked && !googleDirectAllowed()) return res.redirect(`${frontendUrl}/login?error=need_kulogin`);

  const forceConsent = req.query.consent === '1';
  passport.authenticate('google', {
    scope: [
      'profile',
      'email',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/drive.file',
    ],
    accessType: 'offline',
    hostedDomain: KU_WORKSPACE_DOMAIN,
    // รู้บัญชีจากตั๋วแล้ว ไม่ต้องให้เลือกบัญชีซ้ำ
    prompt: forceConsent ? 'consent' : (linked ? undefined : 'select_account'),
    loginHint: linked?.email,
    state: packState({ consent: forceConsent, ticket }),
  })(req, res, next);
});

// POST /auth/google/link — ขอลิงก์เชื่อมบัญชี Google ใหม่ (แถบแจ้งเตือนในหน้าปฏิทิน)
// ต้องเคยผ่าน KU ALL-Login แล้วเท่านั้น
router.post('/google/link', require('../middleware/authenticate'), async (req, res, next) => {
  try {
    const r = await pool.query(`SELECT ku_profile_at FROM users WHERE id = $1`, [req.user.id]);
    if (kuLogin.isProfileRequired() && !r.rows[0]?.ku_profile_at) {
      return res.status(403).json({ error: 'กรุณาเข้าสู่ระบบด้วย KU ALL-Login ก่อน', code: 'need_kulogin' });
    }
    res.json({ url: `${authBase()}/google?ticket=${encodeURIComponent(issueLinkTicket(req.user))}` });
  } catch (err) { next(err); }
});

// Callback หลัง Google login
// ผู้ใช้กดยกเลิกที่หน้า Google → Google ส่ง ?error= กลับมา
router.get('/google/callback', (req, res, next) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  if (req.query.error) {
    return res.redirect(`${frontendUrl}/login?error=google_cancelled`);
  }

  passport.authenticate('google', { session: false }, (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(info?.code || 'domain')}`);

    const admin = isAdminEmail(user.email);
    const state = unpackState(req.query.state);

    if (!admin && kuLogin.isBlockedTypePerson(user.ku_type_person)) {
      return res.redirect(`${frontendUrl}/login?error=ku_type_forbidden`);
    }
    // ยังไม่มี refresh_token เลย (เช่น เคยอนุญาตไว้กับ client เก่า หรือถูกลบ) →
    // ขอหน้าอนุญาตสิทธิ์อีกรอบ 1 ครั้ง ไม่งั้น Calendar/Drive จะใช้ไม่ได้หลัง access token หมดอายุ
    if (!user.google_refresh_token && !state.consent) {
      const t = state.ticket ? `&ticket=${encodeURIComponent(state.ticket)}` : '';
      return res.redirect(`${authBase()}/google?consent=1${t}`);
    }

    // ใช้ fragment (#) แทน query (?) — fragment ไม่ติด server log/Referer/history
    res.redirect(`${frontendUrl}/#token=${signToken(user)}`);
  })(req, res, next);
});

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
    const profile = kuLogin.extractProfile(info);
    const email = profile.email;
    if (!email.endsWith('@ku.th') && !email.endsWith('@ku.ac.th')) {
      // scope ที่ OCS ให้มา (basic openid) อาจไม่ปล่อย claim อีเมลมาเลย
      // log ชื่อ claim ที่ได้จริง เพื่อเทียบกับคู่มือ OCS ว่าต้องขอ scope อะไรเพิ่ม
      console.error('[kulogin exchange] domain reject —',
        `resolved_email=${JSON.stringify(email)}`,
        `claims_received=${JSON.stringify(Object.keys(info))}`);
      return res.status(403).json({ error: 'ku_domain' });
    }

    const name = profile.name || email;
    const role = isAdminEmail(email) ? 'admin' : 'student';

    // Alumni/Guest ใช้งานไม่ได้ (feedback Rev.1 ข้อ 1) — ยกเว้น ADMIN_EMAILS เพื่อกันล็อกตัวเองออก
    if (kuLogin.isBlockedTypePerson(profile.typePerson) && role !== 'admin') {
      console.warn('[kulogin exchange] type-person blocked —',
        `type=${profile.typePerson} email=${email}`);
      return res.status(403).json({ error: 'ku_type_forbidden' });
    }

    // role: preserve ของเดิมเหมือนฝั่ง Google — ดูคอมเมนต์ใน GoogleStrategy
    const result = await pool.query(
      `INSERT INTO users (email, name, role, ku_type_person,
                          ku_faculty, ku_faculty_code, ku_department, ku_department_code,
                          ku_major_id, ku_campus, ku_profile_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         role = CASE WHEN $3::text = 'admin' THEN EXCLUDED.role ELSE users.role END,
         ku_type_person     = EXCLUDED.ku_type_person,
         ku_faculty         = EXCLUDED.ku_faculty,
         ku_faculty_code    = EXCLUDED.ku_faculty_code,
         ku_department      = EXCLUDED.ku_department,
         ku_department_code = EXCLUDED.ku_department_code,
         ku_major_id        = EXCLUDED.ku_major_id,
         ku_campus          = EXCLUDED.ku_campus,
         ku_profile_at      = NOW()
       RETURNING *`,
      [email, name, role, profile.typePerson,
       profile.faculty, profile.facultyCode, profile.department, profile.departmentCode,
       profile.majorId, profile.campus]
    );
    const user = result.rows[0];
    // log ว่าได้ claim หน่วยงานมาจริงไหม — scope 'basic openid' อาจไม่ปล่อยบาง attribute
    console.log('[kulogin exchange] profile saved —',
      `type=${profile.typePerson} faculty_code=${profile.facultyCode} major_id=${profile.majorId}`,
      `claims=${JSON.stringify(Object.keys(info))}`);

    const token = signToken(user);
    // ส่ง id_token กลับด้วย → frontend ใช้เป็น id_token_hint ตอน logout SSO
    // hasCalendar = false → frontend พาไปเชื่อม Google ต่อทันทีด้วย googleLinkUrl (ตั๋วอายุ 15 นาที)
    res.json({
      token,
      idToken: tokens.id_token || null,
      hasCalendar: Boolean(user.google_refresh_token),
      googleLinkUrl: `${authBase()}/google?ticket=${encodeURIComponent(issueLinkTicket(user))}`,
    });
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
      `SELECT (google_refresh_token IS NOT NULL) AS has_calendar,
              (ku_profile_at IS NOT NULL)        AS has_ku_profile,
              ku_type_person
         FROM users WHERE id = $1`,
      [req.user.id]
    );
    const row = r.rows[0] || {};
    // ต่ออายุ token ให้ผู้ที่ใช้งานอยู่ (วันละครั้ง) — frontend เก็บทับของเดิม
    const ageSec = Math.floor(Date.now() / 1000) - (req.tokenIssuedAt || 0);
    const renewedToken = ageSec > TOKEN_RENEW_AFTER_SEC ? signToken(req.user) : undefined;
    res.json({
      ...req.user,
      token: renewedToken,
      has_calendar:   row.has_calendar || false,
      has_ku_profile: row.has_ku_profile || false,
      // frontend ใช้ตัดสินใจว่าต้องพาไปล็อกอิน KU ALL-Login ก่อนจองไหม
      needs_ku_profile: kuLogin.isProfileRequired() && !row.has_ku_profile && !isAdminEmail(req.user.email),
      ku_type_person: row.ku_type_person || null,
    });
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