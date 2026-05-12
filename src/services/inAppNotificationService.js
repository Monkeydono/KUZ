const pool = require('../../config/db');

// สร้าง notification ให้ user เดียว
async function create({ userId, type, title, message, bookingId, link }) {
  if (!userId || !type || !title) {
    throw new Error('userId, type, title required');
  }
  const r = await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, booking_id, link)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [userId, type, title, message || null, bookingId || null, link || null]
  );
  return r.rows[0].id;
}

// สร้าง notification ให้ user หลายคน (เช่นแจ้ง staff+admin)
async function createBulk({ userIds, type, title, message, bookingId, link }) {
  if (!Array.isArray(userIds) || userIds.length === 0) return 0;
  const params = [type, title, message || null, bookingId || null, link || null];
  const valuesClauses = userIds.map((_, i) => `($${i + 6}, $1, $2, $3, $4, $5)`).join(', ');
  await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, booking_id, link)
     VALUES ${valuesClauses}`,
    [...params, ...userIds]
  );
  return userIds.length;
}

async function listForUser(userId, { limit = 20, offset = 0 } = {}) {
  const lim = Math.min(parseInt(limit, 10) || 20, 100);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const r = await pool.query(
    `SELECT id, type, title, message, booking_id, link, is_read, created_at, read_at
       FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3`,
    [userId, lim, off]
  );
  return r.rows;
}

async function getUnreadCount(userId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM notifications
      WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
  return r.rows[0].count;
}

async function markAsRead(notificationId, userId) {
  const r = await pool.query(
    `UPDATE notifications
        SET is_read = true, read_at = NOW()
      WHERE id = $1 AND user_id = $2 AND is_read = false
      RETURNING id`,
    [notificationId, userId]
  );
  return r.rowCount > 0;
}

async function markAllAsRead(userId) {
  const r = await pool.query(
    `UPDATE notifications
        SET is_read = true, read_at = NOW()
      WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
  return r.rowCount;
}

// daily cleanup — ลบ notification ที่อ่านแล้ว > 30 วัน
async function cleanupOld() {
  const r = await pool.query(
    `DELETE FROM notifications
      WHERE is_read = true
        AND read_at < NOW() - INTERVAL '30 days'`
  );
  if (r.rowCount > 0) {
    console.log(`[notification cleanup] deleted ${r.rowCount} old notification(s)`);
  }
  return r.rowCount;
}

// query user id ของ staff + admin ทั้งหมด — ใช้สำหรับ broadcast pending request
async function getApproverIds() {
  const r = await pool.query(
    `SELECT id FROM users WHERE role IN ('staff', 'admin')`
  );
  return r.rows.map(row => row.id);
}

module.exports = {
  create,
  createBulk,
  listForUser,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  cleanupOld,
  getApproverIds,
};
