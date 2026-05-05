const pool = require('../../config/db');
const zoomService = require('./zoomService');
const notificationService = require('./notificationService');
const quotaService = require('./quotaService');

// pre-check ให้ user error ที่อ่านง่ายก่อน insert
// (DB exclusion constraint จะจับ race ที่หลุดเข้ามาทีหลัง)
async function checkConflict(startTime, endTime) {
  const result = await pool.query(
    `SELECT id FROM bookings
     WHERE status = 'confirmed'
       AND tsrange(start_time, end_time, '[)') && tsrange($1::timestamp, $2::timestamp, '[)')`,
    [startTime, endTime]
  );
  return result.rows.length > 0;
}

async function createBooking({ userId, userRole, title, startTime, endTime }) {
  const isAdmin = userRole === 'admin';

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
    const durationMinutes = Math.ceil(duration);
    meeting = await zoomService.createMeeting({ title, startTime, durationMinutes });
  } catch (err) {
    // ถ้า Zoom fail ต้องคืน quota เพราะไม่ได้จองจริง
    if (!isAdmin) await quotaService.returnQuota(userId, start);
    throw { status: 502, message: 'ไม่สามารถสร้างห้อง Zoom ได้ กรุณาลองใหม่' };
  }

  let result;
  try {
    result = await pool.query(
      `INSERT INTO bookings
         (user_id, title, start_time, end_time, zoom_meeting_id, zoom_join_url, zoom_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *,
         (SELECT email FROM users WHERE id = $1) as user_email,
         (SELECT name FROM users WHERE id = $1) as user_name`,
      [userId, title, startTime, endTime,
       meeting.meetingId, meeting.joinUrl, meeting.password]
    );
  } catch (err) {
    // exclusion constraint violation = race condition จับได้ที่ DB
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

  return booking;
}

async function cancelBooking(bookingId, userId, userRole) {
  const isAdmin = userRole === 'admin';

  const ownerClause = isAdmin ? '' : 'AND b.user_id = $2';
  const params = isAdmin ? [bookingId] : [bookingId, userId];
  const result = await pool.query(
    `SELECT b.*, u.email as user_email, u.name as user_name
     FROM bookings b
     JOIN users u ON u.id = b.user_id
     WHERE b.id = $1 ${ownerClause} AND b.status = 'confirmed'`,
    params
  );

  if (result.rows.length === 0) {
    throw { status: 404, message: 'ไม่พบการจองนี้' };
  }

  const booking = result.rows[0];

  // ห้ามยกเลิก meeting ที่เริ่มไปแล้ว/จัดเสร็จแล้ว
  // (ป้องกันการคืน quota ฟรีของอดีต)
  if (new Date(booking.start_time) <= new Date()) {
    throw { status: 400, message: 'ไม่สามารถยกเลิกการจองที่เริ่มไปแล้วได้' };
  }

  await pool.query(
    `UPDATE bookings SET status = 'cancelled' WHERE id = $1`,
    [bookingId]
  );

  // คืน quota ของเดือนที่จอง (ไม่ใช่เดือนปัจจุบัน)
  if (!isAdmin) {
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

async function getUserBookings(userId, { limit = 50, offset = 0 } = {}) {
  const result = await pool.query(
    `SELECT * FROM bookings
     WHERE user_id = $1
     ORDER BY start_time DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return result.rows;
}

module.exports = { createBooking, cancelBooking, getUserBookings };
