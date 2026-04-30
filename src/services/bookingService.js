const pool = require('../../config/db');
const zoomService = require('./zoomService');
const notificationService = require('./notificationService');
const quotaService = require('./quotaService');

// ตรวจ conflict — มีการจองซ้อนเวลาอยู่มั้ย
async function checkConflict(startTime, endTime, excludeId = null) {
  const result = await pool.query(
    `SELECT id FROM bookings
     WHERE status = 'confirmed'
       AND ($1::timestamp, $2::timestamp) OVERLAPS (start_time, end_time)
       AND ($3::uuid IS NULL OR id != $3)`,
    [startTime, endTime, excludeId]
  );
  return result.rows.length > 0;
}

// สร้างการจองใหม่
async function createBooking({ userId, title, startTime, endTime }) {
  // 1. validate input
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

  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  if (start - now > sevenDays) {
    throw { status: 400, message: 'จองล่วงหน้าได้ไม่เกิน 7 วัน' };
  }

  const duration = (end - start) / 60000;
  if (duration > 40) {
    throw { status: 400, message: 'ไม่สามารถจองเกิน 40 นาทีได้ (Zoom free plan)' };
  }

  // 2. ตรวจ conflict
  const hasConflict = await checkConflict(startTime, endTime);
  if (hasConflict) {
    throw { status: 409, message: 'ช่วงเวลานี้ถูกจองแล้ว กรุณาเลือกเวลาอื่น' };
  }

  // 3. ตรวจ quota
  const hasQuota = await quotaService.checkAndUseQuota(userId);
  if (!hasQuota) {
    throw { status: 429, message: 'คุณใช้ quota ครบแล้วในเดือนนี้' };
  }

  // 4. สร้าง Zoom meeting
  const durationMinutes = Math.ceil(duration);
  const meeting = await zoomService.createMeeting({ title, startTime, durationMinutes });

  // 5. บันทึกลง DB พร้อมดึง email และ name ของ user
  const result = await pool.query(
    `INSERT INTO bookings 
       (user_id, title, start_time, end_time, zoom_meeting_id, zoom_join_url, zoom_password)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *,
       (SELECT email FROM users WHERE id = $1) as user_email,
       (SELECT name FROM users WHERE id = $1) as user_name`,
    [userId, title, startTime, endTime,
     meeting.meetingId, meeting.joinUrl, meeting.password]
  );

  const booking = result.rows[0];

  // 6. ยิง n8n webhook แจ้ง email
  await notificationService.sendBookingConfirmation(booking);

  return booking;
}

// ยกเลิกการจอง
async function cancelBooking(bookingId, userId) {
  // ดึงข้อมูล booking พร้อม email และ name
  const result = await pool.query(
    `SELECT b.*, u.email as user_email, u.name as user_name
     FROM bookings b
     JOIN users u ON u.id = b.user_id
     WHERE b.id = $1 AND b.user_id = $2 AND b.status = 'confirmed'`,
    [bookingId, userId]
  );

  if (result.rows.length === 0) {
    throw { status: 404, message: 'ไม่พบการจองนี้' };
  }

  const booking = result.rows[0];

  // อัปเดต status ก่อน — ถ้า DB fail จะไม่ไปลบ Zoom (กัน zombie meeting)
  await pool.query(
    `UPDATE bookings SET status = 'cancelled' WHERE id = $1`,
    [bookingId]
  );

  // คืน quota
  await quotaService.returnQuota(userId);

  // ลบ Zoom meeting — ถ้า fail แค่ log แต่ไม่ throw เพราะ booking cancel แล้ว
  try {
    await zoomService.deleteMeeting(booking.zoom_meeting_id);
  } catch (err) {
    console.error('Zoom delete failed for', booking.zoom_meeting_id, err.message);
  }

  // แจ้ง email ยกเลิก
  await notificationService.sendCancellationNotification(booking);

  return { message: 'ยกเลิกการจองสำเร็จ' };
}

// ดูรายการจองของ user
async function getUserBookings(userId) {
  const result = await pool.query(
    `SELECT * FROM bookings 
     WHERE user_id = $1 
     ORDER BY start_time DESC`,
    [userId]
  );
  return result.rows;
}

module.exports = { createBooking, cancelBooking, getUserBookings };