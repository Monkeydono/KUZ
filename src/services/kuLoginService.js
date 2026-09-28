const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

// KU ALL-Login = Keycloak ของ OCS — OIDC endpoints (จากคู่มือ OCS v2.1)
// host/realm ตั้งผ่าน env ได้ เพราะ OCS อาจให้ client อยู่คนละ realm (เช่น realm ทดสอบ)
// ถ้าค่าผิด Keycloak จะตอบ "Client not found" ตั้งแต่หน้าแรก — แก้ที่ .env ไม่ต้อง deploy ใหม่
const BASE_URL = (process.env.KU_LOGIN_BASE_URL || 'https://alllogin.ku.ac.th').replace(/\/+$/, '');
const REALM    = process.env.KU_LOGIN_REALM || 'KU-Alllogin';
const OIDC     = `${BASE_URL}/realms/${REALM}/protocol/openid-connect`;

const AUTHORIZE = `${OIDC}/auth`;
const TOKEN     = `${OIDC}/token`;
const USERINFO  = `${OIDC}/userinfo`;
const LOGOUT    = `${OIDC}/logout`;

const CLIENT_ID     = process.env.KU_LOGIN_CLIENT_ID;
const CLIENT_SECRET = process.env.KU_LOGIN_CLIENT_SECRET;
const SCOPE         = process.env.KU_LOGIN_SCOPE || 'openid';
const REDIRECT_URI  = process.env.KU_LOGIN_REDIRECT_URI;

// ยังไม่ได้ตั้งค่า (รอ CLIENT_ID/SECRET จาก OCS) → route จะ short-circuit
function isConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI);
}

// บังคับให้ผู้ใช้ยืนยันตัวตนด้วย KU ALL-Login อย่างน้อย 1 ครั้งก่อนจอง (เก็บโปรไฟล์ทำสถิติ)
// ค่าเริ่มต้น = บังคับเมื่อตั้งค่า KU ALL-Login ครบ
// เครื่อง dev ตั้ง REQUIRE_KU_PROFILE=false ได้ เพราะ OCS ลงทะเบียน redirect_uri ไว้แค่ของ production
function isProfileRequired() {
  const v = (process.env.REQUIRE_KU_PROFILE || '').trim().toLowerCase();
  if (v === 'false' || v === '0') return false;
  if (v === 'true' || v === '1') return true;
  return isConfigured();
}

// type-person ที่ไม่ให้ใช้งาน (feedback Rev.1 ข้อ 1): 4 = Alumni, 5 = Guest
const BLOCKED_TYPE_PERSON = new Set(['4', '5']);

function isBlockedTypePerson(typePerson) {
  return typePerson != null && BLOCKED_TYPE_PERSON.has(String(typePerson).trim());
}

// claim อาจมาเป็น string หรือ array (Keycloak multi-valued attribute) → เอาค่าแรก
function claim(info, name) {
  const v = info[name];
  if (Array.isArray(v)) return v.length ? String(v[0]) : null;
  if (v == null || v === '') return null;
  return String(v);
}

// ดึงโปรไฟล์ที่ต้องเก็บจาก userinfo — ชื่อ attribute ตามคู่มือ OCS v2.1
function extractProfile(info) {
  return {
    email:           (claim(info, 'google-mail') || claim(info, 'mail') || claim(info, 'email') || '').toLowerCase(),
    name:            claim(info, 'thainame') || claim(info, 'cn') || claim(info, 'name'),
    typePerson:      claim(info, 'type-person'),
    faculty:         claim(info, 'faculty'),
    facultyCode:     claim(info, 'ku-faculty-code'),
    department:      claim(info, 'department'),
    departmentCode:  claim(info, 'ku-department-code'),
    majorId:         claim(info, 'major-id'),
    campus:          claim(info, 'campus'),
  };
}

// สรุป config ที่ resolve ได้จริง — ไม่มี secret ปนออกมา ใช้ตอนไล่ปัญหากับ OCS
function describeConfig() {
  return {
    realm:        REALM,
    authorize:    AUTHORIZE,
    client_id:    CLIENT_ID || null,
    redirect_uri: REDIRECT_URI || null,
    scope:        SCOPE,
    has_secret:   Boolean(CLIENT_SECRET),
  };
}

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// PKCE (RFC 7636) — KU ALL-Login บังคับใช้กัน CSRF บน authorization code
function generatePKCE() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function buildAuthorizeUrl({ state, codeChallenge }) {
  const params = new URLSearchParams({
    client_id:             CLIENT_ID,
    response_type:         'code',
    scope:                 SCOPE,
    redirect_uri:          REDIRECT_URI,
    state,
    code_challenge:        codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${AUTHORIZE}?${params.toString()}`;
}

// แลก authorization code เป็น tokens (server-to-server, ใช้ client_secret + code_verifier)
async function exchangeCode(code, codeVerifier) {
  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  REDIRECT_URI,
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code_verifier: codeVerifier,
  });
  const res = await axios.post(TOKEN, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000,
  });
  return res.data; // { access_token, id_token, refresh_token, expires_in, ... }
}

// ดึง profile ผู้ใช้ (รวม type-person, mail, thainame ฯลฯ) ด้วย access_token
async function fetchUserInfo(accessToken) {
  const res = await axios.get(USERINFO, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 10000,
  });
  return res.data;
}

module.exports = {
  isConfigured,
  isProfileRequired,
  isBlockedTypePerson,
  extractProfile,
  describeConfig,
  generatePKCE,
  buildAuthorizeUrl,
  exchangeCode,
  fetchUserInfo,
  LOGOUT_ENDPOINT: LOGOUT,
};
