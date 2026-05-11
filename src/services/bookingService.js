const pool = require('../../config/db');
const zoomService = require('./zoomService');
const notificationService = require('./notificationService');
const quotaService = require('./quotaService');
const auditService = require('./auditService');
const googleCalendarService = require('./googleCalendarService');
const roomService = require('./roomService');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_DOMAINS = ['@ku.th', '@ku.ac.th'];
const BKK_TZ = 'Asia/Bangkok';

// ห้อง capacity >= 300 ต้องผ่าน approval จาก staff/admin ก่อน — ป้องกัน priority abuse
const APPROVAL_CAPACITY_THRESHOLD = 300;

// priority user bypass quota รายเดือน แต่ยังจำกัด 40 ชม./สัปดาห์ — ป้องกัน abuse
const PRIORITY_WEEKLY_HOURS_CAP = 40;

// คำนวณชั่วโมงที่ priority user จองแล้วในสัปดาห์นี้ (Mon-Sun ตาม Bangkok TZ)
async function getPriorityWeeklyHours(userId, excludeBookingId = null) {
  const excludeClause = excludeBookingId ? 'AND id != $2' : '';
  const params = excludeBookingId ? [userId, excludeBookingId] : [userId];
  const r = await pool.query(
    `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM end_time - start_time) / 3600), 0)::numeric AS hours
       FROM bookings
      WHERE user_id = $1
        AND status IN ('confirmed', 'pending_approval')
        AND start_time >= date_trunc('week', NOW() AT TIME ZONE 'Asia/Bangkok')
                          AT TIME ZONE 'Asia/Bangkok'
        AND start_time <  date_trunc('week', NOW() AT TIME ZONE 'Asia/Bangkok')
                          AT TIME ZONE 'Asia/Bangkok' + interval '7 days'
        ${excludeClause}`,
    params
  );
  return parseFloat(r.rows[0].hours);
}

// แปลง Date → parts ตาม Asia/Bangkok โดยไม่พึ่ง Node TZ (กัน bug TZ บน prod)
function bangkokParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BKK_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find(p => p.type === type).value;
  return {
    date:   `${get('year')}-${get('month')}-${get('day')}`,
    hour:   parseInt(get('hour'), 10),
    minute: parseInt(get('minute'), 10),
    second: parseInt(get('second'), 10),
  };
}

// validate: จองเฉพาะ 08:00 - 24:00 (Asia/Bangkok)
// end = 00:00:00 ของวันถัดไป = 24:00 ของวันก่อน → อนุญาต
function validateBookingHours(start, end) {
  const s = bangkokParts(start);
  const e = bangkokParts(end);
  if (s.hour < 8) {
    throw { status: 400, message: 'จองได้ตั้งแต่ 08:00 เท่านั้น' };
  }
  if (e.date !== s.date) {
    if (!(e.hour === 0 && e.minute === 0 && e.second === 0)) {
      throw { status: 400, message: 'เวลาสิ้นสุดต้องไม่เกิน 24:00 ของวันเดียวกัน' };
    }
  }
}

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

// ห้องเดียวกันเช็ค overlap, คนละห้องไม่ block
// รวม pending_approval ด้วย — กัน double-book ระหว่างรอ approve
async function checkConflict(startTime, endTime, roomId) {
  const result = await pool.query(
    `SELECT id FROM bookings
     WHERE status IN ('confirmed', 'pending_approval')
       AND room_id = $3
       AND numrange(
             kuz_epoch(start_time),
             kuz_epoch(end_time) + 60,
             '[)'
           )
        && numrange(
             kuz_epoch($1::timestamptz),
             kuz_epoch($2::timestamptz) + 60,
             '[)'
           )`,
    [startTime, endTime, roomId]
  );
  return result.rows.length > 0;
}

// resolve roomId → ห้อง object + ตรวจสอบสิทธิ์ของ user role
async function resolveRoom(roomId, userRole) {
  let room;
  if (roomId) {
    room = await roomService.getRoomWithCreds(roomId);
    if (!room || !room.is_active) {
      throw { status: 404, message: 'ไม่พบห้องที่เลือก หรือห้องถูกปิดใช้งาน' };
    }
  } else {
    const defaultId = await roomService.getDefaultRoomId();
    if (!defaultId) {
      throw { status: 500, message: 'ไม่พบห้อง default ในระบบ' };
    }
    room = await roomService.getRoomWithCreds(defaultId);
  }
  if (room.is_priority_only && userRole !== 'admin' && userRole !== 'priority') {
    throw { status: 403, message: 'ห้องนี้สำหรับ priority/admin เท่านั้น' };
  }
  // ห้อง > 100 คนต้องผูก Zoom Pro account — Free plan รองรับสูงสุด 100
  if (room.capacity > 100 && !room.creds) {
    throw {
      status: 409,
      message: `ห้อง ${room.capacity} คนยังไม่พร้อมใช้งาน — admin ต้องผูก Zoom Pro account ก่อน`,
    };
  }
  return room;
}

// max duration ขึ้นกับห้อง — Free plan 40 นาที, Pro plan ไม่จำกัด
function maxDurationMinutes(room) {
  return room.creds ? 24 * 60 : 40;
}

async function createBooking({ userId, userEmail, userRole, title, startTime, endTime, coHostEmails, roomId, notes }) {
  const isAdmin    = userRole === 'admin';
  const isPriority = userRole === 'priority';
  const bypassQuota = isAdmin || isPriority;

  const coHosts = normalizeCoHosts(coHostEmails);
  validateCoHosts(coHosts, userEmail);

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    throw { status: 400, message: 'กรุณาระบุหัวข้อการประชุม' };
  }
  if (title.length > 200) {
    throw { status: 400, message: 'หัวข้อยาวเกินไป (สูงสุด 200 ตัวอักษร)' };
  }
  const noteText = notes && typeof notes === 'string' ? notes.trim().slice(0, 1000) : null;

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

  validateBookingHours(start, end);

  const room = await resolveRoom(roomId, userRole);
  const duration = (end - start) / 60000;
  const maxMin = maxDurationMinutes(room);
  if (duration > maxMin) {
    throw {
      status: 400,
      message: maxMin === 40
        ? 'ไม่สามารถจองเกิน 40 นาทีได้ (Zoom free plan)'
        : `ไม่สามารถจองเกิน ${maxMin} นาทีได้`,
    };
  }

  if (await checkConflict(startTime, endTime, room.id)) {
    throw { status: 409, message: 'ช่วงเวลานี้ถูกจองห้องนี้แล้ว กรุณาเลือกเวลาอื่นหรือห้องอื่น' };
  }

  // priority weekly soft quota — กัน abuse แม้ bypass quota รายเดือน
  if (isPriority && !isAdmin) {
    const usedHours = await getPriorityWeeklyHours(userId);
    const newHours = duration / 60;
    if (usedHours + newHours > PRIORITY_WEEKLY_HOURS_CAP) {
      throw {
        status: 429,
        message: `เกินโควตา ${PRIORITY_WEEKLY_HOURS_CAP} ชม./สัปดาห์ของ priority (ใช้ไปแล้ว ${usedHours.toFixed(1)} ชม.)`,
      };
    }
  }

  if (!bypassQuota) {
    const hasQuota = await quotaService.checkAndUseQuota(userId, start);
    if (!hasQuota) {
      throw { status: 429, message: 'คุณใช้ quota ครบแล้วในเดือนนี้' };
    }
  }

  // ห้อง capacity >= threshold ต้องรออนุมัติจาก staff/admin (ยกเว้น admin เอง)
  const requiresApproval = room.capacity >= APPROVAL_CAPACITY_THRESHOLD && !isAdmin;

  if (requiresApproval) {
    // ไม่สร้าง Zoom meeting จนกว่าจะ approve (ประหยัด API call + กัน orphan meeting)
    const r = await pool.query(
      `INSERT INTO bookings
         (user_id, title, start_time, end_time, co_host_emails, room_id, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_approval')
       RETURNING *,
         (SELECT email FROM users WHERE id = $1) AS user_email,
         (SELECT name  FROM users WHERE id = $1) AS user_name`,
      [userId, title, startTime, endTime, coHosts, room.id, noteText]
    );
    const booking = r.rows[0];
    await auditService.log({
      userId, bookingId: booking.id, action: 'booking_pending_approval',
      detail: { title, room_id: room.id, room_name: room.name, capacity: room.capacity },
    });
    return booking;
  }

  let meeting;
  try {
    meeting = await zoomService.createMeeting({
      title,
      startTime,
      durationMinutes: Math.ceil(duration),
      creds: room.creds,
    });
  } catch (err) {
    if (!bypassQuota) await quotaService.returnQuota(userId, start);
    throw { status: 502, message: 'ไม่สามารถสร้างห้อง Zoom ได้ กรุณาลองใหม่' };
  }

  let result;
  try {
    result = await pool.query(
      `INSERT INTO bookings
         (user_id, title, start_time, end_time, zoom_meeting_id, zoom_join_url, zoom_password, co_host_emails, room_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *,
         (SELECT email FROM users WHERE id = $1) as user_email,
         (SELECT name FROM users WHERE id = $1) as user_name`,
      [userId, title, startTime, endTime,
       meeting.meetingId, meeting.joinUrl, meeting.password, coHosts, room.id, noteText]
    );
  } catch (err) {
    if (err.code === '23P01') {
      if (!bypassQuota) await quotaService.returnQuota(userId, start);
      try { await zoomService.deleteMeeting(meeting.meetingId, room.creds); }
      catch (e) { console.error('rollback zoom delete failed:', e.message); }
      throw { status: 409, message: 'ช่วงเวลานี้ถูกจองห้องนี้แล้ว กรุณาเลือกเวลาอื่น' };
    }
    throw err;
  }

  const booking = result.rows[0];

  await auditService.log({
    userId: userId, bookingId: booking.id, action: 'booking_created',
    detail: { title, start_time: startTime, end_time: endTime, co_host_count: coHosts.length, room_id: room.id, room_name: room.name },
  });

  await notificationService.sendBookingConfirmation(booking);

  for (const email of coHosts) {
    try {
      await notificationService.sendCoHostInvitation(booking, email);
    } catch (err) {
      console.error('co-host invite failed for', email, err.message);
    }
  }

  googleCalendarService.syncToAttendees(booking, [booking.user_email, ...coHosts])
    .catch(err => console.error('gcal sync failed:', err.message));

  return booking;
}

async function createRecurringBooking({
  userId, userEmail, userRole, title, startTime, endTime, coHostEmails, recurring, roomId, notes,
}) {
  const noteText = notes && typeof notes === 'string' ? notes.trim().slice(0, 1000) : null;
  const isAdmin    = userRole === 'admin';
  const isPriority = userRole === 'priority';
  const bypassQuota = isAdmin || isPriority;

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
  if (!title || !title.trim()) {
    throw { status: 400, message: 'กรุณาระบุหัวข้อการประชุม' };
  }

  validateBookingHours(baseStart, baseEnd);

  const room = await resolveRoom(roomId, userRole);
  // ห้อง capacity >= threshold ต้องรออนุมัติ — ไม่อนุญาตจองแบบ series (กัน admin โดน flood)
  if (room.capacity >= APPROVAL_CAPACITY_THRESHOLD && !isAdmin) {
    throw {
      status: 400,
      message: `ห้อง ${room.capacity} คนต้องรออนุมัติ — กรุณาจองทีละครั้ง (ไม่รองรับ recurring)`,
    };
  }
  const maxMin = maxDurationMinutes(room);
  if ((baseEnd - baseStart) / 60000 > maxMin) {
    throw {
      status: 400,
      message: maxMin === 40
        ? 'ไม่สามารถจองเกิน 40 นาทีได้'
        : `ไม่สามารถจองเกิน ${maxMin} นาทีได้`,
    };
  }

  const occurrences = [];
  for (let i = 0; i < count; i++) {
    occurrences.push({
      startTime: new Date(baseStart.getTime() + i * intervalMs).toISOString(),
      endTime:   new Date(baseEnd.getTime()   + i * intervalMs).toISOString(),
    });
  }

  if (!isAdmin) {
    const lastStart = new Date(occurrences[occurrences.length - 1].startTime);
    if (lastStart - Date.now() > 30 * 24 * 60 * 60 * 1000) {
      throw { status: 400, message: 'จองล่วงหน้าได้ไม่เกิน 30 วัน — ลดจำนวนครั้ง' };
    }
  }

  for (const o of occurrences) {
    if (await checkConflict(o.startTime, o.endTime, room.id)) {
      throw { status: 409, message: `ช่วง ${new Date(o.startTime).toLocaleString('th-TH')} ชนกับ booking อื่นในห้องนี้` };
    }
  }

  // priority weekly cap — รวม duration ทุก occurrence
  if (isPriority && !isAdmin) {
    const totalHours = occurrences.reduce((sum, o) =>
      sum + (new Date(o.endTime) - new Date(o.startTime)) / 3600000, 0);
    const usedHours = await getPriorityWeeklyHours(userId);
    if (usedHours + totalHours > PRIORITY_WEEKLY_HOURS_CAP) {
      throw {
        status: 429,
        message: `เกินโควตา ${PRIORITY_WEEKLY_HOURS_CAP} ชม./สัปดาห์ของ priority (ใช้ ${usedHours.toFixed(1)} + จะใช้ ${totalHours.toFixed(1)} ชม.)`,
      };
    }
  }

  const quotaUsedDates = [];
  if (!bypassQuota) {
    for (const o of occurrences) {
      const ok = await quotaService.checkAndUseQuota(userId, new Date(o.startTime));
      if (!ok) {
        for (const d of quotaUsedDates) await quotaService.returnQuota(userId, d);
        throw { status: 429, message: 'quota ไม่พอสำหรับการจองทั้ง series' };
      }
      quotaUsedDates.push(new Date(o.startTime));
    }
  }

  const meetings = [];
  try {
    for (const o of occurrences) {
      const m = await zoomService.createMeeting({
        title,
        startTime: o.startTime,
        durationMinutes: Math.ceil((new Date(o.endTime) - new Date(o.startTime)) / 60000),
        creds: room.creds,
      });
      meetings.push(m);
    }
  } catch (err) {
    for (const m of meetings) {
      try { await zoomService.deleteMeeting(m.meetingId, room.creds); } catch (e) { /* ignore */ }
    }
    if (!bypassQuota) for (const d of quotaUsedDates) await quotaService.returnQuota(userId, d);
    throw { status: 502, message: 'ไม่สามารถสร้างห้อง Zoom ได้ครบทั้ง series' };
  }

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
            co_host_emails, series_id, room_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *,
           (SELECT email FROM users WHERE id = $1) AS user_email,
           (SELECT name  FROM users WHERE id = $1) AS user_name`,
        [userId, title, o.startTime, o.endTime,
         m.meetingId, m.joinUrl, m.password, coHosts, seriesId, room.id, noteText]
      );
      inserted.push(r.rows[0]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    for (const m of meetings) {
      try { await zoomService.deleteMeeting(m.meetingId, room.creds); } catch (e) { /* ignore */ }
    }
    if (!bypassQuota) for (const d of quotaUsedDates) await quotaService.returnQuota(userId, d);
    if (err.code === '23P01') {
      throw { status: 409, message: 'ช่วงเวลาบางช่วงถูกจองห้องนี้ไปแล้ว ลองใหม่' };
    }
    throw err;
  } finally {
    client.release();
  }

  await auditService.log({
    userId, bookingId: inserted[0].id, action: 'series_created',
    detail: {
      series_id: inserted[0].series_id, count: inserted.length,
      freq: recurring.freq, title, room_id: room.id, room_name: room.name,
    },
  });

  for (const b of inserted) {
    try { await notificationService.sendBookingConfirmation(b); } catch (e) { console.error(e.message); }
    for (const ch of coHosts) {
      try { await notificationService.sendCoHostInvitation(b, ch); } catch (e) { console.error(e.message); }
    }
    googleCalendarService.syncToAttendees(b, [b.user_email, ...coHosts])
      .catch(err => console.error('gcal sync failed:', err.message));
  }

  return inserted;
}

async function cancelBooking(bookingId, userId, userRole, scope = 'this') {
  const isAdmin = userRole === 'admin';

  const ownerClause = isAdmin ? '' : 'AND b.user_id = $2';
  const params = isAdmin ? [bookingId] : [bookingId, userId];
  const targetResult = await pool.query(
    `SELECT b.*, u.role as owner_role,
            za.account_id AS zoom_account_id_str,
            za.client_id AS zoom_client_id,
            za.client_secret AS zoom_client_secret
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       LEFT JOIN rooms r ON r.id = b.room_id
       LEFT JOIN zoom_accounts za ON za.id = r.zoom_account_id
      WHERE b.id = $1 ${ownerClause}`,
    params
  );
  if (targetResult.rows.length === 0) {
    throw { status: 404, message: 'ไม่พบการจองนี้' };
  }
  const target = targetResult.rows[0];

  let toCancel;
  if (scope === 'this' || !target.series_id) {
    if (target.status !== 'confirmed') {
      throw { status: 400, message: 'การจองนี้ถูกยกเลิก/เสร็จสิ้นแล้ว' };
    }
    toCancel = [target];
  } else if (scope === 'future') {
    const r = await pool.query(
      `SELECT b.*, u.role as owner_role,
              za.account_id AS zoom_account_id_str,
              za.client_id AS zoom_client_id,
              za.client_secret AS zoom_client_secret
         FROM bookings b JOIN users u ON u.id = b.user_id
         LEFT JOIN rooms r ON r.id = b.room_id
         LEFT JOIN zoom_accounts za ON za.id = r.zoom_account_id
        WHERE b.series_id = $1
          AND b.start_time >= $2
          AND b.status = 'confirmed'`,
      [target.series_id, target.start_time]
    );
    toCancel = r.rows;
  } else if (scope === 'all') {
    const r = await pool.query(
      `SELECT b.*, u.role as owner_role,
              za.account_id AS zoom_account_id_str,
              za.client_id AS zoom_client_id,
              za.client_secret AS zoom_client_secret
         FROM bookings b JOIN users u ON u.id = b.user_id
         LEFT JOIN rooms r ON r.id = b.room_id
         LEFT JOIN zoom_accounts za ON za.id = r.zoom_account_id
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

    const updRes = await pool.query(
      `UPDATE bookings SET status = 'cancelled'
        WHERE id = $1 AND status = 'confirmed' RETURNING id`,
      [b.id]
    );
    if (updRes.rowCount === 0) continue;

    // คืน quota เฉพาะ student (priority/admin ไม่ใช้ quota)
    if (b.owner_role === 'student' && !hasStarted) {
      await quotaService.returnQuota(b.user_id, b.start_time);
    }

    const roomCreds = b.zoom_account_id_str ? {
      accountId:    b.zoom_account_id_str,
      clientId:     b.zoom_client_id,
      clientSecret: b.zoom_client_secret,
    } : null;

    try { await zoomService.deleteMeeting(b.zoom_meeting_id, roomCreds); }
    catch (err) { console.error('Zoom delete failed for', b.zoom_meeting_id, err.message); }

    googleCalendarService.removeFromAttendees(b.id)
      .catch(err => console.error('gcal remove failed:', err.message));

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

async function getUserBookings(userId, userEmail, { limit = 50, offset = 0 } = {}) {
  const emailLower = (userEmail || '').toLowerCase();
  const result = await pool.query(
    `SELECT b.*,
            u.email AS owner_email,
            u.name  AS owner_name,
            r.name  AS room_name,
            r.capacity AS room_capacity,
            (b.user_id != $1) AS is_co_host
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       LEFT JOIN rooms r ON r.id = b.room_id
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

// approve booking ที่ pending_approval → สร้าง Zoom meeting ตอนนี้ + status=confirmed
async function approveBooking(bookingId, approverId) {
  const r = await pool.query(
    `SELECT b.*, r.capacity AS room_capacity,
            za.account_id   AS zoom_account_id_str,
            za.client_id    AS zoom_client_id,
            za.client_secret AS zoom_client_secret
       FROM bookings b
       LEFT JOIN rooms r ON r.id = b.room_id
       LEFT JOIN zoom_accounts za ON za.id = r.zoom_account_id
      WHERE b.id = $1`,
    [bookingId]
  );
  if (r.rows.length === 0) throw { status: 404, message: 'ไม่พบการจอง' };
  const booking = r.rows[0];
  if (booking.status !== 'pending_approval') {
    throw { status: 400, message: `การจองนี้สถานะ ${booking.status} — ไม่ใช่ pending_approval` };
  }

  const creds = booking.zoom_account_id_str ? {
    accountId:    booking.zoom_account_id_str,
    clientId:     booking.zoom_client_id,
    clientSecret: booking.zoom_client_secret,
  } : null;

  const duration = (new Date(booking.end_time) - new Date(booking.start_time)) / 60000;
  let meeting;
  try {
    meeting = await zoomService.createMeeting({
      title:           booking.title,
      startTime:       booking.start_time.toISOString(),
      durationMinutes: Math.ceil(duration),
      creds,
    });
  } catch (err) {
    throw { status: 502, message: 'ไม่สามารถสร้างห้อง Zoom ได้ตอน approve — ลองใหม่' };
  }

  const upd = await pool.query(
    `UPDATE bookings
        SET status = 'confirmed',
            zoom_meeting_id = $2,
            zoom_join_url   = $3,
            zoom_password   = $4,
            approved_by     = $5,
            approved_at     = NOW()
      WHERE id = $1 AND status = 'pending_approval'
      RETURNING *,
        (SELECT email FROM users WHERE id = user_id) AS user_email,
        (SELECT name  FROM users WHERE id = user_id) AS user_name`,
    [bookingId, meeting.meetingId, meeting.joinUrl, meeting.password, approverId]
  );
  if (upd.rowCount === 0) {
    // race — booking โดน approve/reject ระหว่างทำงาน → cleanup Zoom
    try { await zoomService.deleteMeeting(meeting.meetingId, creds); } catch (e) {}
    throw { status: 409, message: 'การจองนี้ถูกอัปเดตไปแล้ว' };
  }
  const approved = upd.rows[0];

  await auditService.log({
    userId: approverId, bookingId: approved.id, action: 'booking_approved',
    detail: { owner_id: approved.user_id, capacity: booking.room_capacity },
  });

  try { await notificationService.sendBookingConfirmation(approved); } catch (e) { console.error(e.message); }
  for (const email of (approved.co_host_emails || [])) {
    try { await notificationService.sendCoHostInvitation(approved, email); } catch (e) { console.error(e.message); }
  }
  googleCalendarService.syncToAttendees(approved, [approved.user_email, ...(approved.co_host_emails || [])])
    .catch(err => console.error('gcal sync failed:', err.message));

  return approved;
}

// reject booking ที่ pending_approval → status=cancelled + เก็บเหตุผล
async function rejectBooking(bookingId, approverId, reason) {
  const upd = await pool.query(
    `UPDATE bookings
        SET status = 'cancelled',
            approved_by = $2,
            approved_at = NOW(),
            rejected_reason = $3
      WHERE id = $1 AND status = 'pending_approval'
      RETURNING *,
        (SELECT email FROM users WHERE id = user_id) AS user_email,
        (SELECT name  FROM users WHERE id = user_id) AS user_name`,
    [bookingId, approverId, reason || null]
  );
  if (upd.rowCount === 0) {
    throw { status: 409, message: 'การจองนี้ไม่ได้รออนุมัติ หรือถูกอัปเดตไปแล้ว' };
  }
  const rejected = upd.rows[0];

  await auditService.log({
    userId: approverId, bookingId: rejected.id, action: 'booking_rejected',
    detail: { owner_id: rejected.user_id, reason: reason || null },
  });

  try {
    await notificationService.sendCancellationNotification({
      ...rejected,
      rejection_reason: reason,
    });
  } catch (e) { console.error(e.message); }

  return rejected;
}

// admin โอน ownership ให้ user อื่น (เช่นเจ้าของลาออก)
async function transferOwnership(bookingId, newUserId, adminId) {
  const u = await pool.query(`SELECT id, email FROM users WHERE id = $1`, [newUserId]);
  if (u.rows.length === 0) throw { status: 404, message: 'ไม่พบ user ใหม่' };
  const r = await pool.query(
    `UPDATE bookings SET user_id = $1
      WHERE id = $2 AND status IN ('confirmed', 'pending_approval')
      RETURNING id, user_id, title`,
    [newUserId, bookingId]
  );
  if (r.rowCount === 0) throw { status: 404, message: 'ไม่พบการจอง หรือสถานะไม่อนุญาตให้โอน' };
  await auditService.log({
    userId: adminId, bookingId, action: 'booking_transferred',
    detail: { new_owner_id: newUserId, new_owner_email: u.rows[0].email },
  });
  return r.rows[0];
}

module.exports = {
  createBooking,
  createRecurringBooking,
  cancelBooking,
  getUserBookings,
  getJoinInfo,
  approveBooking,
  rejectBooking,
  transferOwnership,
  getPriorityWeeklyHours,
  APPROVAL_CAPACITY_THRESHOLD,
  PRIORITY_WEEKLY_HOURS_CAP,
};
