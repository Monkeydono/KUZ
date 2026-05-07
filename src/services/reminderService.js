const pool = require('../../config/db');
const notificationService = require('./notificationService');

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

module.exports = { sendDueReminders };
