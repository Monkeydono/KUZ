const jwt = require('jsonwebtoken');
const pool = require('../../config/db');
require('dotenv').config();

// คืน user จาก Bearer token หรือ null ถ้าไม่มี token / token ใช้ไม่ได้
// ดึง role/email จาก DB ทุกครั้งเพื่อให้ revoke admin มีผลทันที
// (ไม่เชื่อ role ใน JWT ที่อายุ 7 วัน)
async function resolveUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, reason: 'กรุณา login ก่อน' };
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
  } catch (err) {
    return { user: null, reason: 'Token ไม่ถูกต้องหรือหมดอายุ' };
  }

  const result = await pool.query(
    `SELECT id, email, name, role FROM users WHERE id = $1`,
    [decoded.id]
  );
  if (result.rows.length === 0) {
    return { user: null, reason: 'ไม่พบบัญชีผู้ใช้' };
  }
  return { user: result.rows[0], issuedAt: decoded.iat };
}

async function authenticate(req, res, next) {
  try {
    const { user, reason, issuedAt } = await resolveUser(req);
    if (!user) return res.status(401).json({ error: reason });
    req.user = user;
    req.tokenIssuedAt = issuedAt;
    next();
  } catch (err) {
    next(err);
  }
}

// สำหรับหน้าที่ guest ดูได้ (ปฏิทิน) — มี token ก็ใช้, ไม่มี/หมดอายุก็เป็น guest (req.user = null)
async function optionalAuthenticate(req, res, next) {
  try {
    const { user } = await resolveUser(req);
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = authenticate;
module.exports.optionalAuthenticate = optionalAuthenticate;
