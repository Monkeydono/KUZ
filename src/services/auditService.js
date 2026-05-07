const pool = require('../../config/db');

// log แบบ fire-and-forget — ไม่ throw แม้ insert fail (กัน audit ปลีกย่อย break flow หลัก)
async function log({ userId = null, bookingId = null, action, detail = null }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, booking_id, action, detail)
       VALUES ($1, $2, $3, $4)`,
      [userId, bookingId, action, detail]
    );
  } catch (err) {
    console.error('audit log failed:', err.message, { action, userId, bookingId });
  }
}

module.exports = { log };
