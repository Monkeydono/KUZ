const pool = require('../../config/db');
const notificationService = require('./notificationService');
const inAppNotif = require('./inAppNotificationService');

// หา booking ที่ start ภายใน 14-16 นาทีข้างหน้า + ยังไม่ส่ง reminder + confirmed
// window 2 นาที ป้องกัน cron วิ่งช้า/เร็ว ทำให้พลาด
async function sendDueReminders() {
  const result = await pool.query(
    `SELECT b.*, u.email AS user_email, u.name AS user_name
       FROM bookings b
       JOIN users u ON u.id = b.user_id
      WHERE b.status = 'confirmed'
        AND b.reminder_sent = false
        AND b.start_time BETWEEN NOW() + INTERVAL '14 minutes'
                             AND NOW() + INTERVAL '16 minutes'`
  );

  if (result.rowCount > 0) {
    console.log(`[reminder] found ${result.rowCount} booking(s) due for reminder`);
  }

  for (const booking of result.rows) {
    // mark sent ก่อนยิง webhook กัน duplicate ถ้า cron วิ่งซ้อนกัน
    // (กรณี webhook fail ก็ยอมเสีย reminder รอบนั้น แทนที่จะส่งซ้ำ)
    const updated = await pool.query(
      `UPDATE bookings
          SET reminder_sent = true
        WHERE id = $1 AND reminder_sent = false
        RETURNING id`,
      [booking.id]
    );
    if (updated.rowCount === 0) continue;

    try {
      await notificationService.sendReminderNotification(booking);
    } catch (err) {
      console.error('reminder webhook failed for', booking.id, err.message);
    }
  }
}

// เตือนผู้อนุมัติ (staff/admin) ซ้ำเมื่อคำขอค้าง — feedback Rev.1 ข้อ 5 ป้องกันลืมอนุมัติ
// เงื่อนไข:
//   - ยื่นมาแล้วเกิน 1 ชม. และยังไม่ถึงเวลาประชุม
//   - เตือนทุก 6 ชม. ตามปกติ, ทุก 2 ชม. ถ้าประชุมจะเริ่มภายใน 24 ชม.
// ส่งในแอปแบบสรุปรวม 1 รายการต่อผู้อนุมัติ + อีเมลผ่าน webhook เดิมของคำขอรออนุมัติ (is_reminder = true)
async function sendPendingApprovalReminders() {
  const due = await pool.query(
    `UPDATE bookings b
        SET approval_reminded_at = NOW()
      WHERE b.status = 'pending_approval'
        AND b.start_time > NOW()
        AND b.created_at < NOW() - INTERVAL '1 hour'
        AND (
          b.approval_reminded_at IS NULL
          OR b.approval_reminded_at < NOW() - INTERVAL '6 hours'
          OR (b.start_time < NOW() + INTERVAL '24 hours'
              AND b.approval_reminded_at < NOW() - INTERVAL '2 hours')
        )
      RETURNING b.*,
        (SELECT email FROM users WHERE id = b.user_id) AS user_email,
        (SELECT name  FROM users WHERE id = b.user_id) AS user_name,
        (SELECT name     FROM rooms WHERE id = b.room_id) AS room_name,
        (SELECT capacity FROM rooms WHERE id = b.room_id) AS room_capacity`
  );
  if (due.rowCount === 0) return 0;
  console.log(`[approval-reminder] ${due.rowCount} pending booking(s) still waiting`);

  const approvers = (await pool.query(
    `SELECT id, email, name FROM users WHERE role IN ('staff', 'admin')`
  )).rows;
  if (approvers.length === 0) return due.rowCount;

  const soonest = due.rows.reduce((a, b) => (new Date(a.start_time) < new Date(b.start_time) ? a : b));
  try {
    await inAppNotif.createBulk({
      userIds: approvers.map(a => a.id),
      type:    'booking_pending_reminder',
      title:   `ยังมีคำขอจองห้องรออนุมัติ ${due.rowCount} รายการ`,
      message: `ใกล้ถึงเวลาที่สุด: ${soonest.title}`,
      bookingId: soonest.id,
      link:    '/admin?tab=pending',
    });
  } catch (e) {
    console.error('[approval-reminder] in-app failed:', e.message);
  }

  const contacts = approvers.map(a => ({ email: a.email, name: a.name }));
  for (const booking of due.rows) {
    try {
      await notificationService.sendPendingApprovalRequest(booking, contacts, { isReminder: true });
    } catch (e) {
      console.error('[approval-reminder] webhook failed for', booking.id, e.message);
    }
  }
  return due.rowCount;
}

module.exports = { sendDueReminders, sendPendingApprovalReminders };
