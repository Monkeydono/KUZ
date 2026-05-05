const pool = require('../../config/db');

// แปลง Date เป็น "YYYY-MM-01" สำหรับ key ของเดือนนั้น
function monthKey(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

async function getOrCreateQuota(userId, monthStr = monthKey(new Date())) {
  const result = await pool.query(
    `INSERT INTO quota (user_id, month, used_count, max_count)
     VALUES ($1, $2, 0, 4)
     ON CONFLICT (user_id, month) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [userId, monthStr]
  );
  return result.rows[0];
}

// ตรวจและใช้ quota — atomic กัน race condition
async function checkAndUseQuota(userId, bookingDate = new Date()) {
  const monthStr = monthKey(bookingDate);
  await getOrCreateQuota(userId, monthStr);

  const result = await pool.query(
    `UPDATE quota SET used_count = used_count + 1, updated_at = NOW()
     WHERE user_id = $1 AND month = $2 AND used_count < max_count
     RETURNING id`,
    [userId, monthStr]
  );

  return result.rowCount > 0;
}

// คืน quota ของ "เดือนที่จอง" (ไม่ใช่เดือนปัจจุบัน)
// เพื่อกัน bug: จอง ม.ค. แล้วยกเลิก ก.พ. ต้องคืนของ ม.ค.
async function returnQuota(userId, bookingDate) {
  const monthStr = monthKey(bookingDate);
  await pool.query(
    `UPDATE quota SET used_count = GREATEST(used_count - 1, 0), updated_at = NOW()
     WHERE user_id = $1 AND month = $2`,
    [userId, monthStr]
  );
}

async function getQuota(userId) {
  const quota = await getOrCreateQuota(userId);
  return {
    used:      quota.used_count,
    max:       quota.max_count,
    remaining: quota.max_count - quota.used_count,
    month:     quota.month,
  };
}

module.exports = { checkAndUseQuota, returnQuota, getQuota };
