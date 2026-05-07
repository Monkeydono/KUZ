const pool = require('../../config/db');
const zoomService = require('./zoomService');
const notificationService = require('./notificationService');
const quotaService = require('./quotaService');

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
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (start - now > sevenDays) {
      throw { status: 400, message: 'จองล่วงหน้าได้ไม่เกิน 7 วัน' };
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

  await notificationService.sendBookingConfirmation(booking);

  // เชิญ co-host ทุกคน (fail แต่ละคนไม่ block booking)
  for (const email of coHosts) {
    try {
      await notificationService.sendCoHostInvitation(booking, email);
    } catch (err) {
      console.error('co-host invite failed for', email, err.message);
    }
  }

  return booking;
}

async function cancelBooking(bookingId, userId, userRole) {
  const isAdmin = userRole === 'admin';

  const ownerClause = isAdmin ? '' : 'AND b.user_id = $2';
  const params = isAdmin ? [bookingId] : [bookingId, userId];
  const result = await pool.query(
    `SELECT b.*, u.email as user_email, u.name as user_name, u.role as owner_role
     FROM bookings b
     JOIN users u ON u.id = b.user_id
     WHERE b.id = $1 ${ownerClause} AND b.status = 'confirmed'`,
    params
  );

  if (result.rows.length === 0) {
    throw { status: 404, message: 'ไม่พบการจองนี้' };
  }

  const booking = result.rows[0];

  // ห้ามยกเลิก meeting ที่เริ่มไปแล้ว — ยกเว้น admin (เช่น สั่งปิดห้องฉุกเฉิน)
  const hasStarted = new Date(booking.start_time) <= new Date();
  if (hasStarted && !isAdmin) {
    throw { status: 400, message: 'ไม่สามารถยกเลิกการจองที่เริ่มไปแล้วได้' };
  }

  await pool.query(
    `UPDATE bookings SET status = 'cancelled' WHERE id = $1`,
    [bookingId]
  );

  // คืน quota เฉพาะกรณีเจ้าของเป็น student และยังไม่เริ่ม
  // - admin owner ไม่ใช้ quota → ไม่ต้องคืน
  // - booking ที่เริ่มไปแล้วถือว่าใช้ quota ไปแล้ว → ไม่คืน (กัน abuse)
  if (booking.owner_role === 'student' && !hasStarted) {
    await quotaService.returnQuota(booking.user_id, booking.start_time);
  }

  try {
    await zoomService.deleteMeeting(booking.zoom_meeting_id);
  } catch (err) {
    console.error('Zoom delete failed for', booking.zoom_meeting_id, err.message);
  }

  await notificationService.sendCancellationNotification(booking);

  return { message: 'ยกเลิกการจองสำเร็จ' };
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

module.exports = { createBooking, cancelBooking, getUserBookings, getJoinInfo };
