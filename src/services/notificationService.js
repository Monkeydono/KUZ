const axios = require('axios');
require('dotenv').config();

// รองรับทั้งชื่อใหม่ (NOTIFICATION) และชื่อเก่า (WEBHOOK) เผื่อ backwards compat
const BOOKING_URL = process.env.N8N_NOTIFICATION_WEBHOOK_URL || process.env.N8N_WEBHOOK_URL;
const CANCEL_URL = process.env.N8N_CANCELLATION_WEBHOOK_URL;

async function sendWebhook(url, payload, label) {
  if (!url) {
    console.warn(`[${label}] webhook URL not configured — skipping`);
    return;
  }
  try {
    const res = await axios.post(url, payload, { timeout: 10000 });
    console.log(`[${label}] sent OK (${res.status}) → ${url}`);
  } catch (err) {
    const status = err.response?.status;
    const data   = err.response?.data;
    console.error(`[${label}] FAILED → ${url}`);
    console.error(`  status: ${status}, message: ${err.message}`);
    if (data) console.error('  response body:', data);
  }
}

const formatDate = (iso) => new Date(iso).toLocaleDateString('th-TH');
const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

async function sendBookingConfirmation(booking) {
  await sendWebhook(BOOKING_URL, {
    type:      'booking_created',
    email:     booking.user_email,
    name:      booking.user_name,
    title:     booking.title,
    date:      formatDate(booking.start_time),
    time:      `${formatTime(booking.start_time)} - ${formatTime(booking.end_time)}`,
    zoom_link: booking.zoom_join_url,
  }, 'booking_created');
}

async function sendCancellationNotification(booking) {
  await sendWebhook(CANCEL_URL, {
    type:  'booking_cancelled',
    email: booking.user_email,
    name:  booking.user_name,
    title: booking.title,
    date:  formatDate(booking.start_time),
    time:  `${formatTime(booking.start_time)} - ${formatTime(booking.end_time)}`,
  }, 'booking_cancelled');
}

module.exports = { sendBookingConfirmation, sendCancellationNotification };
