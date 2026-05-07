const jwt = require('jsonwebtoken');
const pool = require('../../config/db');
require('dotenv').config();

// ดึง role/email จาก DB ทุกครั้งเพื่อให้ revoke admin มีผลทันที
// (ไม่เชื่อ role ใน JWT ที่อายุ 7 วัน)
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'กรุณา login ก่อน' });
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ' });
  }

  try {
    const result = await pool.query(
      `SELECT id, email, name, role FROM users WHERE id = $1`,
      [decoded.id]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'ไม่พบบัญชีผู้ใช้' });
    }
    req.user = result.rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = authenticate;
