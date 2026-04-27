 
const app  = require('./app');
const cron = require('node-cron');
require('dotenv').config();

const PORT = process.env.PORT || 3000;

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// Cron job: auto-complete bookings ทุก 5 นาที
const pool = require('../config/db');
cron.schedule('*/5 * * * *', async () => {
  try {
    await pool.query('SELECT auto_complete_bookings()');
    console.log('⏰ Auto-complete bookings ran');
  } catch (err) {
    console.error('Cron error:', err.message);
  }
});