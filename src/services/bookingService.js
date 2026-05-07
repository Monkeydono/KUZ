const pool = require('../../config/db');
const zoomService = require('./zoomService');
const notificationService = require('./notificationService');
const quotaService = require('./quotaService');
const auditService = require('./auditService');
const googleCalendarService = require('./googleCalendarService');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_DOMAINS = ['@ku.th', '@ku.ac.th'];

function normalizeCoHosts(input) {
  if (!input) return [];
  const arr = Array.isArray(input)
    ? input
    : String(input).split(',');
  return arr
    .map(e => String(e).trim().toLowerCase())
    .filter(e => e.length > 0);
}

function validateCoHosts(emails, ownerEmail) {
  for (const email of emails) {
    if (!EMAIL_REGEX.test(email)) {
      throw { status: 400, message: `อีเมล co-host ไม่ถูกต้อง: ${email}` };
    }
    if (!ALLOWED_DOMAINS.some(d => email.endsWith(d))) {
      throw {
        status: 400,
        message: `Co-host ต้องเป็นอีเมลของมหาวิทยาลัย (@ku.th หรือ @ku.ac.th): ${email}`,
      };
    }
    if (email === ownerEmail.toLowerCase()) {
      throw { status: 400, message: 'ผู้จองเป็น host อยู่แล้ว ไม่ต้องระบุเป็น co-host' };
    }
  }
  if (emails.length > 10) {
    throw { status: 400, message: 'ระบุ co-host ได้สูงสุด 10 คน' };
  }
}

// ต้องมี gap >= 1 นาทีระหว่าง booking — เลย buffer end_time +1 ทั้งสองฝั่ง
async function checkConflict(startTime, endTime) {
  const result = await pool.query(
    `SELECT id FROM bookings
     WHERE status = 'confirmed'
       AND tsrange(start_time, end_time + interval '1 minute', '[)')
        && tsrange($1::timestamp, $2::timestamp + interval '1 minute', '[)')`,
    [startTime, endTime]
  );
  return result.rows.length > 0;
}

async function createBooking({ userId, userEmail, userRole, title, startTime, endTime, coHostEmails }) {
  const isAdmin = userRole === 'admin';
  const coHosts = normalizeCoHosts(coHostEmails);
  validateCoHosts(coHosts, userEmail);

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    throw { status: 400, message: 'กรุณาระบุหัวข้อการประชุม' };
  }
  if (title.length > 200) {
    throw { status: 400, message: 'หัวข้อยาวเกินไป (สูงสุด 200 ตัวอักษร)' };
  }

  const start = new Date(startTime);
  const end   = new Date(endTime);
  if (isNaN(start) || isNaN(end)) {
    throw { status: 400, message: 'รูปแบบวันที่ไม่ถูกต้อง' };
  }
  if (end <= start) {
    throw { status: 400, message: 'เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม' };
  }

  const now = new Date();
  if (start < now) {
    throw { status: 400, message: 'ไม่สามารถจองย้อนหลังได้' };
  }

  if (!isAdmin) {
    const maxAhead = 30 * 24 * 60 * 60 * 1000;
    if (start - now > maxAhead) {
      throw { status: 400, message: 'จองล่วงหน้าได้ไม่เกิน 30 วัน' };
    }
  }

  const duration = (end - start) / 60000;
  if (duration > 40) {
    throw { status: 400, message: 'ไม่สามารถจองเกิน 40 นาทีได้ (Zoom free plan)' };
  }

  if (await checkConflict(startTime, endTime)) {
    throw { status: 409, message: 'ช่วงเวลานี้ถูกจองแล้ว กรุณาเลือกเวลาอื่น' };
  }

  if (!isAdmin) {
    const hasQuota = await quotaService.checkAndUseQuota(userId, start);
    if (!hasQuota) {
      throw { status: 429, message: 'คุณใช้ quota ครบแล้วในเดือนนี้' };
    }
  }

  let meeting;
  try {
    meeting = await zoomService.createMeeting({
      title,
      startTime,
      durationMinutes: Math.ceil(duration),
    });
  } catch (err) {
    if (!isAdmin) await quotaService.returnQuota(userId, start);
    throw { status: 502, message: 'ไม่สามารถสร้างห้อง Zoom ได้ กรุณาลองใหม่' };
  }

  let result;
  try {
    result = await pool.query(
      `INSERT INTO bookings
         (user_id, title, start_time, end_time, zoom_meeting_id, zoom_join_url, zoom_password, co_host_emails)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *,
         (SELECT email FROM users WHERE id = $1) as user_email,
         (SELECT name FROM users WHERE id = $1) as user_name`,
      [userId, title, startTime, endTime,
       meeting.meetingId, meeting.joinUrl, meeting.password, coHosts]
    );
  } catch (err) {
    if (err.code === '23P01') {
      if (!isAdmin) await quotaService.returnQuota(userId, start);
      try { await zoomService.deleteMeeting(meeting.meetingId); }
      catch (e) { console.error('rollback zoom delete failed:', e.message); }
      throw { status: 409, message: 'ช่วงเวลานี้ถูกจองแล้ว กรุณาเลือกเวลาอื่น' };
    }
    throw err;
  }

  const booking = result.rows[0];

  await auditService.log({
    userId: userId, bookingId: booking.id, action: 'booking_created',
    detail: { title, start_time: startTime, end_time: endTime, co_host_count: coHosts.length },
  });

  await notificationService.sendBookingConfirmation(booking);

  // เชิญ co-host ทุกคน (fail แต่ละคนไม่ block booking)
  for (const email of coHosts) {
    try {
      await notificationService.sendCoHostInvitation(booking, email);
    } catch (err) {
      console.error('co-host invite failed for', email, err.message);
    }
  }

  // sync เข้า Google Calendar ของ owner + co-host (fire-and-forget — ไม่ block)
  googleCalendarService.syncToAttendees(booking, [booking.user_email, ...coHosts])
    .catch(err => console.error('gcal sync failed:', err.message));

  return booking;
}

// สร้าง booking ซ้ำเป็น series — atomic ด้วย DB transaction + manual rollback Zoom/quota
async function createRecurringBooking({
  userId, userEmail, userRole, title, startTime, endTime, coHostEmails, recurring,
}) {
  const isAdmin = userRole === 'admin';
  const coHosts = normalizeCoHosts(coHostEmails);
  validateCoHosts(coHosts, userEmail);

  const count = Math.min(Math.max(parseInt(recurring.count, 10) || 1, 1), 26);
  const intervalMs = (recurring.freq === 'daily' ? 1 : 7) * 24 * 60 * 60 * 1000;

  const baseStart = new Date(startTime);
  const baseEnd   = new Date(endTime);
  if (isNaN(baseStart) || isNaN(baseEnd) || baseEnd <= baseStart) {
    throw { status: 400, message: 'รูปแบบวันที่/เวลาไม่ถูกต้อง' };
  }
  if (baseStart < new Date()) {
    throw { status: 400, message: 'ไม่สามารถจองย้อนหลังได้' };
  }
  if ((baseEnd - baseStart) / 60000 > 40) {
    throw { status: 400, message: 'ไม่สามารถจองเกิน 40 นาทีได้' };
  }
  if (!title || !title.trim()) {
    throw { status: 400, message: 'กรุณาระบุหัวข้อการประชุม' };
  }

  const occurrences = [];
  for (let i = 0; i < count; i++) {
    occurrences.push({
      startTime: new Date(baseStart.getTime() + i * intervalMs).toISOString(),
      endTime:   new Date(baseEnd.getTime()   + i * intervalMs).toISOString(),
    });
  }

  // student: ทุก occurrence ต้องอยู่ใน 30 วัน
  if (!isAdmin) {
    const lastStart = new Date(occurrences[occurrences.length - 1].startTime);
    if (lastStart - Date.now() > 30 * 24 * 60 * 60 * 1000) {
      throw { status: 400, message: 'student จองล่วงหน้าเกิน 30 วันไม่ได้ — ลด recurrence count' };
    }
  }

  // pre-check conflicts ทุกครั้ง
  for (const o of occurrences) {
    if (await checkConflict(o.startTime, o.endTime)) {
      throw { status: 409, message: `ช่วง ${new Date(o.startTime).toLocaleString('th-TH')} ชนกับ booking อื่น` };
    }
  }

  // ใช้ quota ทีละครั้ง (มี rollback ถ้า fail)
  const quotaUsedDates = [];
  if (!isAdmin) {
    for (const o of occurrences) {
      const ok = await quotaService.checkAndUseQuota(userId, new Date(o.startTime));
      if (!ok) {
        for (const d of quotaUsedDates) await quotaService.returnQuota(userId, d);
        throw { status: 429, message: 'quota ไม่พอสำหรับการจองทั้ง series' };
      }
      quotaUsedDates.push(new Date(o.startTime));
    }
  }

  // สร้าง Zoom meeting ทีละ — fail = rollback ทั้งหมด
  const meetings = [];
  try {
    for (const o of occurrences) {
      const m = await zoomService.createMeeting({
        title,
        startTime: o.startTime,
        durationMinutes: Math.ceil((new Date(o.endTime) - new Date(o.startTime)) / 60000),
      });
      meetings.push(m);
    }
  } catch (err) {
    for (const m of meetings) {
      try { await zoomService.deleteMeeting(m.meetingId); } catch (e) { /* ignore */ }
    }
    if (!isAdmin) for (const d of quotaUsedDates) await quotaService.returnQuota(userId, d);
    throw { status: 502, message: 'ไม่สามารถสร้างห้อง Zoom ได้ครบทั้ง series' };
  }

  // INSERT ทั้งหมดใน transaction
  const client = await pool.connect();
  let inserted;
  try {
    await client.query('BEGIN');
    const seriesResult = await client.query('SELECT gen_random_uuid() AS id');
    const seriesId = seriesResult.rows[0].id;

    inserted = [];
    for (let i = 0; i < occurrences.length; i++) {
      const o = occurrences[i];
      const m = meetings[i];
      const r = await client.query(
        `INSERT INTO bookings
           (user_id, title, start_time, end_time,
            zoom_meeting_id, zoom_join_url, zoom_password,
            co_host_emails, series_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *,
           (SELECT email FROM users WHERE id = $1) AS user_email,
           (SELECT name  FROM users WHERE id = $1) AS user_name`,
        [userId, title, o.startTime, o.endTime,
         m.meetingId, m.joinUrl, m.password, coHosts, seriesId]
      );
      inserted.push(r.rows[0]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    for (const m of meetings) {
      try { await zoomService.deleteMeeting(m.meetingId); } catch (e) { /* ignore */ }
    }
    if (!isAdmin) for (const d of quotaUsedDates) await quotaService.returnQuota(userId, d);
    if (err.code === '23P01') {
      throw { status: 409, message: 'ช่วงเวลาบางช่วงถูกจองโดยคนอื่นไปแล้ว ลองใหม่' };
    }
    throw err;
  } finally {
    client.release();
  }

  // log series creation (1 log สำหรับ series)
  await auditService.log({
    userId, bookingId: inserted[0].id, action: 'series_created',
    detail: {
      series_id: inserted[0].series_id, count: inserted.length,
      freq: recurring.freq, title,
    },
  });

  // ส่ง email (fail ส่วนตัวไม่ block)
  for (const b of inserted) {
    try { await notificationService.sendBookingConfirmation(b); } catch (e) { console.error(e.message); }
    for (const ch of coHosts) {
      try { await notificationService.sendCoHostInvitation(b, ch); } catch (e) { console.error(e.message); }
    }
    // sync แต่ละ occurrence ไป calendar
    googleCalendarService.syncToAttendees(b, [b.user_email, ...coHosts])
      .catch(err => console.error('gcal sync failed:', err.message));
  }

  return inserted;
}

// scope: 'this' (ตัวเดียว) | 'future' (ตัวนี้ + อนาคตใน series) | 'all' (ทุกตัวใน series ที่ยังไม่เริ่ม)
async function cancelBooking(bookingId, userId, userRole, scope = 'this') {
  const isAdmin = userRole === 'admin';

  // ดึง booking เป้าหมาย — เพื่อรู้ series_id + ownership
  const ownerClause = isAdmin ? '' : 'AND b.user_id = $2';
  const params = isAdmin ? [bookingId] : [bookingId, userId];
  const targetResult = await pool.query(
    `SELECT b.*, u.role as owner_role
       FROM bookings b
       JOIN users u ON u.id = b.user_id
      WHERE b.id = $1 ${ownerClause}`,
    params
  );
  if (targetResult.rows.length === 0) {
    throw { status: 404, message: 'ไม่พบการจองนี้' };
  }
  const target = targetResult.rows[0];

  // หา list booking ที่จะ cancel ตาม scope
  let toCancel;
  if (scope === 'this' || !target.series_id) {
    if (target.status !== 'confirmed') {
      throw { status: 400, message: 'การจองนี้ถูกยกเลิก/เสร็จสิ้นแล้ว' };
    }
    toCancel = [target];
  } else if (scope === 'future') {
    const r = await pool.query(
      `SELECT b.*, u.role as owner_role
         FROM bookings b JOIN users u ON u.id = b.user_id
        WHERE b.series_id = $1
          AND b.start_time >= $2
          AND b.status = 'confirmed'`,
      [target.series_id, target.start_time]
    );
    toCancel = r.rows;
  } else if (scope === 'all') {
    const r = await pool.query(
      `SELECT b.*, u.role as owner_role
         FROM bookings b JOIN users u ON u.id = b.user_id
        WHERE b.series_id = $1 AND b.status = 'confirmed'`,
      [target.series_id]
    );
    toCancel = r.rows;
  } else {
    throw { status: 400, message: 'scope ไม่ถูกต้อง' };
  }

  const cancelled = [];
  const skipped = [];
  const now = new Date();

  for (const b of toCancel) {
    const hasStarted = new Date(b.start_time) <= now;
    if (hasStarted && !isAdmin) {
      skipped.push(b.id);
      continue;
    }

    // mark cancelled
    const updRes = await pool.query(
      `UPDATE bookings SET status = 'cancelled'
        WHERE id = $1 AND status = 'confirmed' RETURNING id`,
      [b.id]
    );
    if (updRes.rowCount === 0) continue; // race: ถูก cancel ไปแล้ว

    if (b.owner_role === 'student' && !hasStarted) {
      await quotaService.returnQuota(b.user_id, b.start_time);
    }

    try { await zoomService.deleteMeeting(b.zoom_meeting_id); }
    catch (err) { console.error('Zoom delete failed for', b.zoom_meeting_id, err.message); }

    // ลบ event ออกจาก Google Calendar ทุกคน (fire-and-forget)
    googleCalendarService.removeFromAttendees(b.id)
      .catch(err => console.error('gcal remove failed:', err.message));

    // ดึง email/name ของ owner เพื่อ notify
    const ownerRes = await pool.query(
      `SELECT email, name FROM users WHERE id = $1`,
      [b.user_id]
    );
    const owner = ownerRes.rows[0];
    try {
      await notificationService.sendCancellationNotification({
        ...b,
        user_email: owner.email,
        user_name:  owner.name,
      });
    } catch (e) { console.error(e.message); }

    await auditService.log({
      userId, bookingId: b.id,
      action: isAdmin && b.user_id !== userId ? 'admin_cancelled' : 'booking_cancelled',
      detail: { scope, was_started: hasStarted, owner_id: b.user_id },
    });

    cancelled.push(b.id);
  }

  return {
    message: `ยกเลิกสำเร็จ ${cancelled.length} รายการ${skipped.length ? ` (ข้าม ${skipped.length} รายการที่เริ่มไปแล้ว)` : ''}`,
    cancelled: cancelled.length,
    skipped: skipped.length,
  };
}

// คืน booking ที่ user เป็น owner หรือเป็น co-host
// เพิ่ม flag `is_co_host` (true ถ้า user ไม่ใช่ owner แต่ถูกเชิญเป็น co-host)
async function getUserBookings(userId, userEmail, { limit = 50, offset = 0 } = {}) {
  const emailLower = (userEmail || '').toLowerCase();
  const result = await pool.query(
    `SELECT b.*,
            u.email AS owner_email,
            u.name  AS owner_name,
            (b.user_id != $1) AS is_co_host
       FROM bookings b
       JOIN users u ON u.id = b.user_id
      WHERE b.user_id = $1
         OR EXISTS (
              SELECT 1 FROM unnest(b.co_host_emails) AS ch(email)
               WHERE LOWER(ch.email) = $2
            )
      ORDER BY b.start_time DESC
      LIMIT $3 OFFSET $4`,
    [userId, emailLower, limit, offset]
  );
  return result.rows;
}

// อนุญาตเข้าห้อง Zoom ได้ตั้งแต่ start_time จน end_time + 5 นาที
// owner / co-host / admin เข้าได้ — คนอื่นไม่ได้
const JOIN_GRACE_AFTER_END_MS = 5 * 60 * 1000;

async function getJoinInfo(bookingId, requester) {
  const result = await pool.query(
    `SELECT b.*, u.email AS owner_email
       FROM bookings b
       JOIN users u ON u.id = b.user_id
      WHERE b.id = $1`,
    [bookingId]
  );
  if (result.rows.length === 0) {
    throw { status: 404, message: 'ไม่พบการจองนี้' };
  }
  const booking = result.rows[0];

  if (booking.status !== 'confirmed') {
    throw { status: 410, message: 'การจองนี้ถูกยกเลิกหรือสิ้นสุดแล้ว' };
  }

  const isOwner = booking.user_id === requester.id;
  const isCoHost = (booking.co_host_emails || [])
    .map(e => e.toLowerCase())
    .includes(requester.email.toLowerCase());
  const isAdmin = requester.role === 'admin';
  if (!isOwner && !isCoHost && !isAdmin) {
    throw { status: 403, message: 'คุณไม่มีสิทธิ์เข้าห้องนี้' };
  }

  const now = Date.now();
  const start = new Date(booking.start_time).getTime();
  const end = new Date(booking.end_time).getTime();

  if (now < start) {
    // 425 Too Early — frontend ใช้แสดง countdown
    throw { status: 425, message: 'ยังไม่ถึงเวลาเข้าห้อง', startsAt: booking.start_time };
  }
  if (now > end + JOIN_GRACE_AFTER_END_MS) {
    throw { status: 410, message: 'หมดเวลาเข้าห้องแล้ว' };
  }

  return {
    joinUrl:  booking.zoom_join_url,
    password: booking.zoom_password,
    title:    booking.title,
    endTime:  booking.end_time,
  };
}

module.exports = {
  createBooking,
  createRecurringBooking,
  cancelBooking,
  getUserBookings,
  getJoinInfo,
};
