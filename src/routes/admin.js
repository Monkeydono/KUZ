const express = require('express');
const router = express.Router();
const pool = require('../../config/db');
const requireAdmin = require('../middleware/requireAdmin');
const bookingService = require('../services/bookingService');
const auditService = require('../services/auditService');

router.use(requireAdmin);

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
      `SELECT b.*, u.email AS user_email, u.name AS user_name
         FROM bookings b
         JOIN users u ON u.id = b.user_id
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

// DELETE /admin/bookings/:id — admin ยกเลิก booking ใดก็ได้
router.delete('/bookings/:id', async (req, res, next) => {
  try {
    const result = await bookingService.cancelBooking(req.params.id, req.user.id, 'admin');
    res.json(result);
  } catch (err) {
    next(err);
  }
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

// PATCH /admin/users/:id/role — เปลี่ยน role (student ↔ admin)
router.patch('/users/:id/role', async (req, res, next) => {
  try {
    const { role } = req.body;
    if (role !== 'admin' && role !== 'student') {
      return res.status(400).json({ error: 'role ต้องเป็น admin หรือ student' });
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

router.get('/bookings.csv', async (req, res, next) => {
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

router.get('/users.csv', async (req, res, next) => {
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
