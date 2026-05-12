const app  = require('./app');
const cron = require('node-cron');
require('dotenv').config();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

const pool = require('../config/db');
const reminderService = require('./services/reminderService');
const inAppNotif = require('./services/inAppNotificationService');
const bookingService = require('./services/bookingService');

// auto-complete bookings ที่ end_time ผ่านไปแล้ว — ทุก 5 นาที
cron.schedule('*/5 * * * *', async () => {
  try {
    await pool.query('SELECT auto_complete_bookings()');
    console.log('Auto-complete bookings ran');
  } catch (err) {
    console.error('Cron auto-complete error:', err.message);
  }
});

// ส่ง reminder 15 นาทีก่อนประชุม — ทุก 1 นาที
cron.schedule('* * * * *', async () => {
  try {
    await reminderService.sendDueReminders();
  } catch (err) {
    console.error('Cron reminder error:', err.message);
  }
});

// ลบ notification ที่อ่านแล้ว > 30 วัน — ทุกวันตี 3
cron.schedule('0 3 * * *', async () => {
  try {
    await inAppNotif.cleanupOld();
  } catch (err) {
    console.error('Cron notification cleanup error:', err.message);
  }
});

// auto-expire pending_approval ที่ start_time ผ่านไปแล้ว — ทุก 15 นาที
cron.schedule('*/15 * * * *', async () => {
  try {
    await bookingService.autoExpirePending();
  } catch (err) {
    console.error('Cron pending-expire error:', err.message);
  }
});
