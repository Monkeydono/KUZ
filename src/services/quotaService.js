const pool = require('../../config/db');

// ดึง quota ของ user เดือนนี้ (สร้างใหม่ถ้ายังไม่มี)
async function getOrCreateQuota(userId) {
  const month = new Date();
  month.setDate(1);
  month.setHours(0, 0, 0, 0);
  const monthStr = month.toISOString().split('T')[0];

  // upsert — สร้างถ้าไม่มี
  const result = await pool.query(
    `INSERT INTO quota (user_id, month, used_count, max_count)
     VALUES ($1, $2, 0, 4)
     ON CONFLICT (user_id, month) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [userId, monthStr]
  );

  return result.rows[0];
}

// ตรวจและใช้ quota — atomic เพื่อกัน race condition
async function checkAndUseQuota(userId) {
  await getOrCreateQuota(userId);

  const month = new Date();
  month.setDate(1);
  month.setHours(0, 0, 0, 0);
  const monthStr = month.toISOString().split('T')[0];

  // increment เฉพาะเมื่อยังไม่เต็ม — ทำใน statement เดียว ไม่มี TOCTOU
  const result = await pool.query(
    `UPDATE quota SET used_count = used_count + 1, updated_at = NOW()
     WHERE user_id = $1 AND month = $2 AND used_count < max_count
     RETURNING id`,
    [userId, monthStr]
  );

  return result.rowCount > 0;
}

// คืน quota เมื่อยกเลิกการจอง
async function returnQuota(userId) {
  const month = new Date();
  month.setDate(1);
  const monthStr = month.toISOString().split('T')[0];

  await pool.query(
    `UPDATE quota SET used_count = GREATEST(used_count - 1, 0), updated_at = NOW()
     WHERE user_id = $1 AND month = $2`,
    [userId, monthStr]
  );
}

// ดู quota ของ user
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