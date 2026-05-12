const express = require('express');
const router = express.Router();
const pool = require('../../config/db');
const requireAdmin = require('../middleware/requireAdmin');
const requireStaff = require('../middleware/requireStaff');
const bookingService = require('../services/bookingService');
const auditService = require('../services/auditService');
const zoomService = require('../services/zoomService');

// helper: validate room.capacity ≤ zoom_account.max_attendees
async function assertCapacityFitsAccount(zoomAccountId, capacity) {
  if (!zoomAccountId) return;
  const r = await pool.query(
    `SELECT max_attendees, label FROM zoom_accounts WHERE id = $1`,
    [zoomAccountId]
  );
  if (r.rows.length === 0) {
    throw { status: 404, message: 'ไม่พบ Zoom account' };
  }
  if (capacity > r.rows[0].max_attendees) {
    throw {
      status: 400,
      message: `Capacity ${capacity} เกิน license ของ Zoom account "${r.rows[0].label}" (${r.rows[0].max_attendees} คน)`,
    };
  }
}

// staff (moderator) เข้าได้: stats, bookings list, cancel, users list, audit
// admin only: role change, rooms CRUD, zoom_accounts CRUD, CSV exports
router.use(requireStaff);

// GET /admin/stats — ตัวเลขสรุป + ข้อมูลกราฟ
router.get('/stats', async (req, res, next) => {
  try {
    const [totals, byDay, byStatus, topUsers, peakHours] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'confirmed' AND start_time >= NOW())               AS upcoming,
          COUNT(*) FILTER (WHERE DATE(start_time AT TIME ZONE 'Asia/Bangkok')
                                 = DATE(NOW()       AT TIME ZONE 'Asia/Bangkok'))             AS today,
          COUNT(*) FILTER (WHERE start_time >= NOW() - INTERVAL '7 days')                     AS week,
          COUNT(*) FILTER (WHERE start_time >= NOW() - INTERVAL '30 days')                    AS month,
          COUNT(*) FILTER (WHERE status = 'cancelled' AND start_time >= NOW() - INTERVAL '30 days') AS cancelled_month,
          (SELECT COUNT(*) FROM users)                                                        AS users_total,
          (SELECT COUNT(*) FROM users WHERE role = 'admin')                                   AS admins_total
        FROM bookings
      `),
      // booking ต่อวัน 14 วันย้อนหลัง (รวมวันนี้)
      pool.query(`
        SELECT DATE(start_time AT TIME ZONE 'Asia/Bangkok') AS day,
               COUNT(*) FILTER (WHERE status != 'cancelled') AS created,
               COUNT(*) FILTER (WHERE status  = 'cancelled') AS cancelled
          FROM bookings
         WHERE start_time >= NOW() - INTERVAL '14 days'
         GROUP BY day
         ORDER BY day
      `),
      pool.query(`
        SELECT status, COUNT(*) AS count
          FROM bookings
         WHERE start_time >= NOW() - INTERVAL '30 days'
         GROUP BY status
      `),
      pool.query(`
        SELECT u.email, u.name, COUNT(b.id) AS bookings
          FROM bookings b
          JOIN users u ON u.id = b.user_id
         WHERE b.start_time >= NOW() - INTERVAL '30 days'
           AND b.status != 'cancelled'
         GROUP BY u.id
         ORDER BY bookings DESC
         LIMIT 5
      `),
      // ชั่วโมงนิยมสุด (เพื่อกราฟแท่ง)
      pool.query(`
        SELECT EXTRACT(HOUR FROM start_time AT TIME ZONE 'Asia/Bangkok')::int AS hour,
               COUNT(*) AS count
          FROM bookings
         WHERE start_time >= NOW() - INTERVAL '30 days'
           AND status != 'cancelled'
         GROUP BY hour
         ORDER BY hour
      `),
    ]);

    res.json({
      totals:    totals.rows[0],
      byDay:     byDay.rows,
      byStatus:  byStatus.rows,
      topUsers:  topUsers.rows,
      peakHours: peakHours.rows,
    });
  } catch (err) {
    next(err);
  }
});

// GET /admin/bookings — list + filter
router.get('/bookings', async (req, res, next) => {
  try {
    const { status, from, to, search } = req.query;
    const limit  = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const offset = parseInt(req.query.offset, 10) || 0;

    const conditions = [];
    const params = [];
    let i = 1;

    if (status) { conditions.push(`b.status = $${i++}`);             params.push(status); }
    if (from)   { conditions.push(`b.start_time >= $${i++}`);        params.push(from); }
    if (to)     { conditions.push(`b.start_time <= $${i++}`);        params.push(to); }
    if (search) {
      conditions.push(`(b.title ILIKE $${i} OR u.email ILIKE $${i} OR u.name ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT b.*, u.email AS user_email, u.name AS user_name,
              r.name AS room_name, r.capacity AS room_capacity
         FROM bookings b
         JOIN users u ON u.id = b.user_id
         LEFT JOIN rooms r ON r.id = b.room_id
         ${where}
         ORDER BY b.start_time DESC
         LIMIT $${i++} OFFSET $${i++}`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// DELETE /admin/bookings/:id — admin/staff ยกเลิก booking ใดก็ได้ (ต้องใส่เหตุผล)
router.delete('/bookings/:id', async (req, res, next) => {
  try {
    const reason = req.body?.reason || req.query.reason || null;
    const scope  = req.query.scope || 'this';
    const result = await bookingService.cancelBooking(
      req.params.id, req.user.id, req.user.role, scope, reason
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /admin/bookings/:id/approve — staff/admin อนุมัติ booking ห้องใหญ่
router.post('/bookings/:id/approve', async (req, res, next) => {
  try {
    const result = await bookingService.approveBooking(req.params.id, req.user.id);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /admin/bookings/:id/reject — staff/admin ปฏิเสธ booking + เก็บเหตุผล
router.post('/bookings/:id/reject', async (req, res, next) => {
  try {
    const { reason } = req.body;
    const result = await bookingService.rejectBooking(req.params.id, req.user.id, reason);
    res.json(result);
  } catch (err) { next(err); }
});

// PATCH /admin/bookings/:id/transfer — admin โอน ownership ให้ user อื่น
router.patch('/bookings/:id/transfer', requireAdmin, async (req, res, next) => {
  try {
    const { new_user_id } = req.body;
    if (!new_user_id) return res.status(400).json({ error: 'ต้องระบุ new_user_id' });
    const result = await bookingService.transferOwnership(req.params.id, new_user_id, req.user.id);
    res.json(result);
  } catch (err) { next(err); }
});

// PATCH /admin/bookings/:id/reassign-room — admin/staff ย้ายห้อง (กรณี Zoom account ล่ม / maintenance)
router.patch('/bookings/:id/reassign-room', async (req, res, next) => {
  try {
    const { new_room_id } = req.body;
    if (!new_room_id) return res.status(400).json({ error: 'ต้องระบุ new_room_id' });
    const result = await bookingService.reassignRoom(req.params.id, new_room_id, req.user.id);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /admin/users — list + quota เดือนนี้
router.get('/users', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.email, u.name, u.role, u.created_at,
             COALESCE(q.used_count, 0) AS quota_used,
             COALESCE(q.max_count, 4)  AS quota_max,
             (SELECT COUNT(*) FROM bookings b
                WHERE b.user_id = u.id AND b.status = 'confirmed') AS confirmed_total,
             (SELECT COUNT(*) FROM bookings b
                WHERE b.user_id = u.id AND b.status = 'cancelled') AS cancelled_total
        FROM users u
        LEFT JOIN quota q ON q.user_id = u.id
                         AND q.month = DATE_TRUNC('month', NOW())::date
        ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/users/:id/role — เปลี่ยน role (student ↔ priority ↔ admin)
router.patch('/users/:id/role', requireAdmin, async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['admin', 'staff', 'priority', 'student'].includes(role)) {
      return res.status(400).json({ error: 'role ต้องเป็น admin, staff, priority หรือ student' });
    }
    if (req.params.id === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'ไม่สามารถลด role ของตัวเองได้' });
    }
    const result = await pool.query(
      `UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, name, role`,
      [role, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบ user' });
    }
    await auditService.log({
      userId: req.user.id, action: 'role_changed',
      detail: { target_user_id: req.params.id, target_email: result.rows[0].email, new_role: role },
    });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ========= Rooms =========

router.get('/rooms', async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT r.*, za.label AS zoom_account_label,
              (SELECT COUNT(*) FROM bookings b WHERE b.room_id = r.id AND b.status = 'confirmed') AS upcoming_count
         FROM rooms r
         LEFT JOIN zoom_accounts za ON za.id = r.zoom_account_id
         ORDER BY r.is_priority_only ASC, r.capacity ASC, r.name ASC`
    );
    res.json(r.rows);
  } catch (err) { next(err); }
});

router.post('/rooms', requireAdmin, async (req, res, next) => {
  try {
    const { name, capacity, zoom_account_id, is_priority_only, is_active } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'ต้องระบุชื่อห้อง' });
    const cap = parseInt(capacity, 10);
    if (!cap || cap < 1 || cap > 10000) {
      return res.status(400).json({ error: 'capacity ต้องเป็นจำนวนเต็ม 1-10000' });
    }
    await assertCapacityFitsAccount(zoom_account_id || null, cap);
    const r = await pool.query(
      `INSERT INTO rooms (name, capacity, zoom_account_id, is_priority_only, is_active)
       VALUES ($1, $2, $3, COALESCE($4, false), COALESCE($5, true))
       RETURNING *`,
      [name.trim(), cap, zoom_account_id || null, is_priority_only, is_active]
    );
    await auditService.log({
      userId: req.user.id, action: 'room_created',
      detail: { room_id: r.rows[0].id, name: r.rows[0].name, capacity: cap },
    });
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'ชื่อห้องนี้มีอยู่แล้ว' });
    next(err);
  }
});

router.patch('/rooms/:id', requireAdmin, async (req, res, next) => {
  try {
    const { name, capacity, zoom_account_id, is_priority_only, is_active } = req.body;
    // ถ้าเปลี่ยน capacity หรือ zoom_account_id → validate capacity ≤ max_attendees
    if (capacity !== undefined || zoom_account_id !== undefined) {
      const cur = await pool.query(
        `SELECT capacity, zoom_account_id FROM rooms WHERE id = $1`,
        [req.params.id]
      );
      if (cur.rows.length === 0) return res.status(404).json({ error: 'ไม่พบห้อง' });
      const newCap   = capacity !== undefined ? parseInt(capacity, 10) : cur.rows[0].capacity;
      const newZoom  = zoom_account_id !== undefined ? (zoom_account_id || null) : cur.rows[0].zoom_account_id;
      await assertCapacityFitsAccount(newZoom, newCap);
    }
    const fields = [];
    const params = [];
    let i = 1;
    if (name !== undefined)             { fields.push(`name = $${i++}`);             params.push(name.trim()); }
    if (capacity !== undefined)         { fields.push(`capacity = $${i++}`);         params.push(parseInt(capacity, 10)); }
    if (zoom_account_id !== undefined)  { fields.push(`zoom_account_id = $${i++}`);  params.push(zoom_account_id || null); }
    if (is_priority_only !== undefined) { fields.push(`is_priority_only = $${i++}`); params.push(!!is_priority_only); }
    if (is_active !== undefined)        { fields.push(`is_active = $${i++}`);        params.push(!!is_active); }
    if (fields.length === 0) return res.status(400).json({ error: 'ไม่มีอะไรให้แก้' });
    fields.push(`updated_at = NOW()`);
    params.push(req.params.id);
    const r = await pool.query(
      `UPDATE rooms SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      params
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'ไม่พบห้อง' });
    await auditService.log({
      userId: req.user.id, action: 'room_updated',
      detail: { room_id: req.params.id, changes: req.body },
    });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/rooms/:id', requireAdmin, async (req, res, next) => {
  try {
    // ปลอดภัยกว่า: ไม่ลบจริง — แค่ตั้ง is_active=false (booking เก่ายังอ้างห้องได้)
    const r = await pool.query(
      `UPDATE rooms SET is_active = false, updated_at = NOW()
        WHERE id = $1 RETURNING id, name`,
      [req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'ไม่พบห้อง' });
    await auditService.log({
      userId: req.user.id, action: 'room_deactivated',
      detail: { room_id: req.params.id, name: r.rows[0].name },
    });
    res.json({ message: 'ปิดใช้งานห้องแล้ว', id: r.rows[0].id });
  } catch (err) { next(err); }
});

// ========= Zoom Accounts =========
// security note: client_secret ถูก return เฉพาะตอน create (เพื่อยืนยัน) — list ปกติจะ mask

router.get('/zoom-accounts', requireAdmin, async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT id, label, account_id, client_id, max_attendees,
              ('***' || RIGHT(client_secret, 4)) AS client_secret_masked,
              created_at, updated_at,
              (SELECT COUNT(*) FROM rooms WHERE zoom_account_id = zoom_accounts.id) AS room_count
         FROM zoom_accounts
         ORDER BY label ASC`
    );
    res.json(r.rows);
  } catch (err) { next(err); }
});

router.post('/zoom-accounts', requireAdmin, async (req, res, next) => {
  try {
    const { label, account_id, client_id, client_secret, max_attendees } = req.body;
    if (!label || !account_id || !client_id || !client_secret) {
      return res.status(400).json({ error: 'ต้องระบุ label, account_id, client_id, client_secret' });
    }
    const maxAtt = parseInt(max_attendees, 10);
    if (!maxAtt || maxAtt < 1 || maxAtt > 10000) {
      return res.status(400).json({ error: 'max_attendees ต้องเป็นจำนวนเต็ม 1-10000 (license limit)' });
    }
    const r = await pool.query(
      `INSERT INTO zoom_accounts (label, account_id, client_id, client_secret, max_attendees)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, label, account_id, client_id, max_attendees, created_at`,
      [label.trim(), account_id.trim(), client_id.trim(), client_secret, maxAtt]
    );
    await auditService.log({
      userId: req.user.id, action: 'zoom_account_created',
      detail: { id: r.rows[0].id, label, max_attendees: maxAtt },
    });
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'label นี้มีอยู่แล้ว' });
    next(err);
  }
});

router.patch('/zoom-accounts/:id', requireAdmin, async (req, res, next) => {
  try {
    const { label, account_id, client_id, client_secret, max_attendees } = req.body;
    const fields = [];
    const params = [];
    let i = 1;
    if (label !== undefined)         { fields.push(`label = $${i++}`);         params.push(label.trim()); }
    if (account_id !== undefined)    { fields.push(`account_id = $${i++}`);    params.push(account_id.trim()); }
    if (client_id !== undefined)     { fields.push(`client_id = $${i++}`);     params.push(client_id.trim()); }
    if (client_secret !== undefined) { fields.push(`client_secret = $${i++}`); params.push(client_secret); }
    if (max_attendees !== undefined) {
      const m = parseInt(max_attendees, 10);
      if (!m || m < 1 || m > 10000) {
        return res.status(400).json({ error: 'max_attendees ต้อง 1-10000' });
      }
      // ตรวจว่าไม่มีห้องที่ capacity > new max_attendees
      const conflict = await pool.query(
        `SELECT name, capacity FROM rooms
          WHERE zoom_account_id = $1 AND capacity > $2`,
        [req.params.id, m]
      );
      if (conflict.rows.length > 0) {
        return res.status(409).json({
          error: `มีห้องที่ capacity เกิน ${m}: ${conflict.rows.map(c => `${c.name} (${c.capacity})`).join(', ')}`,
        });
      }
      fields.push(`max_attendees = $${i++}`); params.push(m);
    }
    if (fields.length === 0) return res.status(400).json({ error: 'ไม่มีอะไรให้แก้' });
    fields.push(`updated_at = NOW()`);
    params.push(req.params.id);
    const r = await pool.query(
      `UPDATE zoom_accounts SET ${fields.join(', ')} WHERE id = $${i}
       RETURNING id, label, account_id, client_id, max_attendees, updated_at`,
      params
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'ไม่พบ zoom account' });
    await auditService.log({
      userId: req.user.id, action: 'zoom_account_updated',
      detail: { id: req.params.id, changed: Object.keys(req.body) },
    });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// health check: ทดสอบ token refresh ของ Zoom account
router.get('/zoom-accounts/:id/health', requireAdmin, async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT account_id, client_id, client_secret FROM zoom_accounts WHERE id = $1`,
      [req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'ไม่พบ zoom account' });
    const row = r.rows[0];
    try {
      // ลอง getZoomToken ใน path ที่ไม่ cache (เรียกผ่าน createMeeting จะ cache)
      // ใช้ axios call trực tiếp ผ่าน zoomService internal — ที่นี่ create-then-delete
      const test = await zoomService.createMeeting({
        title: '[KUZ health check] — ลบทันที',
        startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        durationMinutes: 1,
        creds: {
          accountId:    row.account_id,
          clientId:     row.client_id,
          clientSecret: row.client_secret,
        },
      });
      // cleanup ทันที
      try { await zoomService.deleteMeeting(test.meetingId, {
        accountId:    row.account_id,
        clientId:     row.client_id,
        clientSecret: row.client_secret,
      }); } catch (e) {}
      res.json({ ok: true, message: 'Token refresh + Create meeting ผ่าน' });
    } catch (err) {
      res.json({
        ok: false,
        error: err.zoomMessage || err.message,
        status: err.zoomStatus,
      });
    }
  } catch (err) { next(err); }
});

// GET /admin/zoom-accounts/:id/utilization — สถิติการใช้งานของ account นี้
// query params: days (default 30) — ช่วงย้อนหลังที่จะ aggregate
router.get('/zoom-accounts/:id/utilization', async (req, res, next) => {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 30, 365);
    const r = await pool.query(
      `WITH stats AS (
         SELECT b.id, b.start_time, b.end_time, b.actual_started_at, b.actual_ended_at,
                EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 3600 AS scheduled_hours,
                CASE
                  WHEN b.actual_started_at IS NOT NULL AND b.actual_ended_at IS NOT NULL
                  THEN EXTRACT(EPOCH FROM (b.actual_ended_at - b.actual_started_at)) / 3600
                  ELSE NULL
                END AS actual_hours,
                EXTRACT(HOUR FROM (b.start_time AT TIME ZONE 'Asia/Bangkok')) AS hour_of_day
           FROM bookings b
           JOIN rooms r ON r.id = b.room_id
          WHERE r.zoom_account_id = $1
            AND b.status IN ('confirmed', 'completed', 'pending_approval')
            AND b.start_time >= NOW() - ($2 || ' days')::interval
       )
       SELECT
         (SELECT COUNT(*)::int FROM stats) AS total_bookings,
         (SELECT COALESCE(SUM(scheduled_hours), 0)::numeric(10,2) FROM stats) AS total_scheduled_hours,
         (SELECT COALESCE(SUM(actual_hours), 0)::numeric(10,2) FROM stats WHERE actual_hours IS NOT NULL) AS total_actual_hours,
         (SELECT COUNT(*)::int FROM stats WHERE actual_started_at IS NOT NULL) AS bookings_started,
         (SELECT COUNT(*)::int FROM stats WHERE actual_started_at IS NULL AND end_time < NOW()) AS bookings_no_show,
         (SELECT json_agg(json_build_object('hour', hour_of_day, 'count', cnt) ORDER BY hour_of_day)
            FROM (SELECT hour_of_day, COUNT(*)::int AS cnt FROM stats GROUP BY hour_of_day) h
         ) AS hourly_distribution,
         (SELECT json_agg(json_build_object(
                'name', r.name, 'capacity', r.capacity,
                'booking_count', (SELECT COUNT(*) FROM bookings b
                                   WHERE b.room_id = r.id AND b.status IN ('confirmed','completed','pending_approval')
                                     AND b.start_time >= NOW() - ($2 || ' days')::interval)
              ))
            FROM rooms r WHERE r.zoom_account_id = $1
         ) AS rooms_breakdown
      `,
      [req.params.id, String(days)]
    );
    res.json({ ...r.rows[0], window_days: days });
  } catch (err) { next(err); }
});

router.delete('/zoom-accounts/:id', requireAdmin, async (req, res, next) => {
  try {
    // ป้องกัน orphan: เช็คว่ามีห้องผูกอยู่ไหม
    const used = await pool.query(
      `SELECT COUNT(*)::int AS n FROM rooms WHERE zoom_account_id = $1`,
      [req.params.id]
    );
    if (used.rows[0].n > 0) {
      return res.status(409).json({ error: `มี ${used.rows[0].n} ห้องผูกกับ account นี้ — ต้องเปลี่ยน account ของห้องก่อน` });
    }
    const r = await pool.query(
      `DELETE FROM zoom_accounts WHERE id = $1 RETURNING id, label`,
      [req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'ไม่พบ zoom account' });
    await auditService.log({
      userId: req.user.id, action: 'zoom_account_deleted',
      detail: { id: req.params.id, label: r.rows[0].label },
    });
    res.json({ message: 'ลบแล้ว', id: r.rows[0].id });
  } catch (err) { next(err); }
});

// GET /admin/audit-logs?action=&user_id=&from=&to=&limit=&offset=
router.get('/audit-logs', async (req, res, next) => {
  try {
    const { action, user_id, from, to } = req.query;
    const limit  = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const offset = parseInt(req.query.offset, 10) || 0;

    const conditions = [];
    const params = [];
    let i = 1;
    if (action)  { conditions.push(`a.action = $${i++}`);     params.push(action); }
    if (user_id) { conditions.push(`a.user_id = $${i++}`);    params.push(user_id); }
    if (from)    { conditions.push(`a.created_at >= $${i++}`); params.push(from); }
    if (to)      { conditions.push(`a.created_at <= $${i++}`); params.push(to); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT a.id, a.action, a.detail, a.created_at,
              a.user_id, u.email AS user_email, u.name AS user_name,
              a.booking_id, b.title AS booking_title
         FROM audit_logs a
         LEFT JOIN users    u ON u.id = a.user_id
         LEFT JOIN bookings b ON b.id = a.booking_id
         ${where}
         ORDER BY a.created_at DESC
         LIMIT $${i++} OFFSET $${i++}`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// helper escape ค่าตามมาตรฐาน CSV (RFC 4180)
function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCSV(headers, rows) {
  const lines = [headers.map(h => csvEscape(h.label)).join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => csvEscape(h.value(row))).join(','));
  }
  // BOM ให้ Excel เปิดภาษาไทยถูก
  return '﻿' + lines.join('\r\n');
}

function sendCSV(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

router.get('/bookings.csv', requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT b.*, u.email AS user_email, u.name AS user_name
         FROM bookings b
         JOIN users u ON u.id = b.user_id
         ORDER BY b.start_time DESC
         LIMIT 5000`
    );
    const csv = rowsToCSV(
      [
        { label: 'ID',         value: r => r.id },
        { label: 'Title',      value: r => r.title },
        { label: 'Start',      value: r => new Date(r.start_time).toISOString() },
        { label: 'End',        value: r => new Date(r.end_time).toISOString() },
        { label: 'Status',     value: r => r.status },
        { label: 'Owner Name', value: r => r.user_name },
        { label: 'Owner Email',value: r => r.user_email },
        { label: 'Co-hosts',   value: r => (r.co_host_emails || []).join('; ') },
        { label: 'Zoom URL',   value: r => r.zoom_join_url },
        { label: 'Created',    value: r => new Date(r.created_at).toISOString() },
      ],
      result.rows
    );
    const date = new Date().toISOString().slice(0, 10);
    sendCSV(res, `kuz-bookings-${date}.csv`, csv);
  } catch (err) {
    next(err);
  }
});

router.get('/users.csv', requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.email, u.name, u.role, u.created_at,
             COALESCE(q.used_count, 0) AS quota_used,
             COALESCE(q.max_count, 4)  AS quota_max,
             (SELECT COUNT(*) FROM bookings b
                WHERE b.user_id = u.id AND b.status = 'confirmed') AS confirmed_total,
             (SELECT COUNT(*) FROM bookings b
                WHERE b.user_id = u.id AND b.status = 'cancelled') AS cancelled_total
        FROM users u
        LEFT JOIN quota q ON q.user_id = u.id
                         AND q.month = DATE_TRUNC('month', NOW())::date
        ORDER BY u.created_at DESC
    `);
    const csv = rowsToCSV(
      [
        { label: 'ID',              value: r => r.id },
        { label: 'Email',           value: r => r.email },
        { label: 'Name',            value: r => r.name },
        { label: 'Role',            value: r => r.role },
        { label: 'Quota Used (mo)', value: r => r.quota_used },
        { label: 'Quota Max (mo)',  value: r => r.quota_max },
        { label: 'Confirmed Total', value: r => r.confirmed_total },
        { label: 'Cancelled Total', value: r => r.cancelled_total },
        { label: 'Created',         value: r => new Date(r.created_at).toISOString() },
      ],
      result.rows
    );
    const date = new Date().toISOString().slice(0, 10);
    sendCSV(res, `kuz-users-${date}.csv`, csv);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
