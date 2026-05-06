const app  = require('./app');
const cron = require('node-cron');
require('dotenv').config();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

const pool = require('../config/db');
const reminderService = require('./services/reminderService');

// auto-complete bookings ที่ end_time ผ่านไปแล้ว — ทุก 5 นาที
cron.schedule('*/5 * * * *', async () => {
  try {
    await pool.query('SELECT auto_complete_bookings()');
    console.log('⏰ Auto-complete bookings ran');
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
