const pool = require('../../config/db');

// ดึงห้องตาม id + zoom credentials ที่ใช้ — ถ้า zoom_account_id NULL จะ return creds = null
// (caller ใช้ ENV creds แทน)
async function getRoomWithCreds(roomId) {
  if (!roomId) return null;
  const r = await pool.query(
    `SELECT r.id, r.name, r.capacity, r.is_priority_only, r.is_active,
            r.zoom_account_id,
            za.account_id   AS zoom_account_id_str,
            za.client_id    AS zoom_client_id,
            za.client_secret AS zoom_client_secret
       FROM rooms r
       LEFT JOIN zoom_accounts za ON za.id = r.zoom_account_id
      WHERE r.id = $1`,
    [roomId]
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return {
    id:               row.id,
    name:             row.name,
    capacity:         row.capacity,
    is_priority_only: row.is_priority_only,
    is_active:        row.is_active,
    creds: row.zoom_account_id ? {
      accountId:    row.zoom_account_id_str,
      clientId:     row.zoom_client_id,
      clientSecret: row.zoom_client_secret,
    } : null,
  };
}

// ดึง room id ของ default room (ห้องทั่วไปที่ env-based)
async function getDefaultRoomId() {
  const r = await pool.query(
    `SELECT id FROM rooms
      WHERE is_priority_only = false AND is_active = true
      ORDER BY zoom_account_id NULLS FIRST, created_at ASC
      LIMIT 1`
  );
  return r.rows[0]?.id || null;
}

// ห้องทั้งหมดที่ user role ปัจจุบันจองได้
// ห้อง capacity > 100 ที่ไม่มี zoom_account ผูก = ยังไม่พร้อมใช้งาน (need_zoom_pro=true)
// (Free plan รองรับสูงสุด 100 คน — capacity 300/1000 ต้อง Zoom Pro)
async function listAvailableRooms(role) {
  const conds = ['is_active = true'];
  if (role !== 'admin' && role !== 'priority') {
    conds.push('is_priority_only = false');
  }
  const r = await pool.query(
    `SELECT id, name, capacity, is_priority_only,
            (zoom_account_id IS NOT NULL) AS has_zoom_account,
            (capacity > 100 AND zoom_account_id IS NULL) AS needs_zoom_pro
       FROM rooms
      WHERE ${conds.join(' AND ')}
      ORDER BY is_priority_only ASC, capacity ASC, name ASC`
  );
  return r.rows;
}

module.exports = { getRoomWithCreds, getDefaultRoomId, listAvailableRooms };
