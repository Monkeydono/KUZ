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

// query ids ของห้องทั้งหมดใน tier (capacity) ที่ role ปัจจุบันใช้งานได้
// ใช้เป็น base ของ tier-availability + auto-assignment เมื่อ Pro plan มีหลายห้องต่อ tier
async function getRoomIdsByCapacity(capacity, role) {
  const conds = ['is_active = true', 'capacity = $1'];
  const params = [capacity];
  if (role !== 'admin' && role !== 'priority') {
    conds.push('is_priority_only = false');
  }
  // Pro tier (>100) ต้องมี zoom_account ผูก = พร้อมใช้งาน
  if (capacity > 100) {
    conds.push('zoom_account_id IS NOT NULL');
  }
  const r = await pool.query(
    `SELECT id FROM rooms WHERE ${conds.join(' AND ')} ORDER BY created_at ASC`,
    params
  );
  return r.rows.map(row => row.id);
}

// หาห้องว่างใน tier ตามเวลาที่ขอ — return room object เต็มพร้อม creds, หรือ null ถ้าเต็มหมด
// ใช้ตอน user เลือก capacity แทน roomId → backend auto-pick
// excludeIds: Set ของ id ที่เคยลองแล้ว (สำหรับ race retry)
async function findAvailableRoomByCapacity(capacity, startTime, endTime, role, excludeIds = new Set()) {
  const ids = await getRoomIdsByCapacity(capacity, role);
  for (const id of ids) {
    if (excludeIds.has(id)) continue;
    const conflict = await pool.query(
      `SELECT 1 FROM bookings
        WHERE status IN ('confirmed', 'pending_approval')
          AND room_id = $1
          AND numrange(
                kuz_epoch(start_time),
                kuz_epoch(end_time) + 60,
                '[)'
              )
           && numrange(
                kuz_epoch($2::timestamptz),
                kuz_epoch($3::timestamptz) + 60,
                '[)'
              )
        LIMIT 1`,
      [id, startTime, endTime]
    );
    if (conflict.rowCount === 0) {
      return await getRoomWithCreds(id);
    }
  }
  return null;
}

// หาห้องที่ว่างครบทุก occurrence ใน series — ใช้สำหรับ recurring + capacity-based
// (ไม่ใช่แค่ห้องว่างช่วง first occurrence — ต้องว่างทุกครั้งจึงจะใช้ห้องเดียวกันได้)
async function findAvailableRoomForAllOccurrences(capacity, occurrences, role) {
  const ids = await getRoomIdsByCapacity(capacity, role);
  for (const id of ids) {
    let allFree = true;
    for (const o of occurrences) {
      const c = await pool.query(
        `SELECT 1 FROM bookings
          WHERE status IN ('confirmed', 'pending_approval')
            AND room_id = $1
            AND numrange(kuz_epoch(start_time), kuz_epoch(end_time) + 60, '[)')
             && numrange(kuz_epoch($2::timestamptz), kuz_epoch($3::timestamptz) + 60, '[)')
          LIMIT 1`,
        [id, o.startTime, o.endTime]
      );
      if (c.rowCount > 0) { allFree = false; break; }
    }
    if (allFree) return await getRoomWithCreds(id);
  }
  return null;
}

// แนะนำ tier ขนาดใหญ่ขึ้นที่ยังมีห้องว่างในช่วงเวลานี้ — ใช้ใน error message
async function suggestAvailableLargerTier(currentCapacity, startTime, endTime, role) {
  const conds = ['is_active = true', 'capacity > $1'];
  const params = [currentCapacity];
  if (role !== 'admin' && role !== 'priority') {
    conds.push('is_priority_only = false');
  }
  conds.push('zoom_account_id IS NOT NULL'); // tier ใหญ่กว่า 100 ต้องมี Pro account
  const r = await pool.query(
    `SELECT DISTINCT capacity FROM rooms WHERE ${conds.join(' AND ')} ORDER BY capacity ASC`,
    params
  );
  for (const row of r.rows) {
    const found = await findAvailableRoomByCapacity(row.capacity, startTime, endTime, role);
    if (found) return row.capacity;
  }
  return null;
}

module.exports = {
  getRoomWithCreds,
  getDefaultRoomId,
  listAvailableRooms,
  getRoomIdsByCapacity,
  findAvailableRoomByCapacity,
  findAvailableRoomForAllOccurrences,
  suggestAvailableLargerTier,
};
