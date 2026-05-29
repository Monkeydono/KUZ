const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

// KU ALL-Login = Keycloak realm "KU-Alllogin" — OIDC endpoints (จากคู่มือ OCS v2.1)
const AUTHORIZE = 'https://alllogin.ku.ac.th/realms/KU-Alllogin/protocol/openid-connect/auth';
const TOKEN     = 'https://alllogin.ku.ac.th/realms/KU-Alllogin/protocol/openid-connect/token';
const USERINFO  = 'https://alllogin.ku.ac.th/realms/KU-Alllogin/protocol/openid-connect/userinfo';
const LOGOUT    = 'https://alllogin.ku.ac.th/realms/KU-Alllogin/protocol/openid-connect/logout';

const CLIENT_ID     = process.env.KU_LOGIN_CLIENT_ID;
const CLIENT_SECRET = process.env.KU_LOGIN_CLIENT_SECRET;
const SCOPE         = process.env.KU_LOGIN_SCOPE || 'openid';
const REDIRECT_URI  = process.env.KU_LOGIN_REDIRECT_URI;

// ยังไม่ได้ตั้งค่า (รอ CLIENT_ID/SECRET จาก OCS) → route จะ short-circuit
function isConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI);
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
  generatePKCE,
  buildAuthorizeUrl,
  exchangeCode,
  fetchUserInfo,
  LOGOUT_ENDPOINT: LOGOUT,
};
