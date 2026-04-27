const axios = require('axios');
require('dotenv').config();

// ส่ง email เมื่อจองสำเร็จ
async function sendBookingConfirmation(booking) {
  try {
    await axios.post(process.env.N8N_WEBHOOK_URL, {
      email:     booking.user_email,
      name:      booking.user_name,
      date:      new Date(booking.start_time).toLocaleDateString('th-TH'),
      time:      `${new Date(booking.start_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} - ${new Date(booking.end_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`,
      zoom_link: booking.zoom_join_url,
    });
  } catch (err) {
    // ไม่ให้ notification error กระทบ booking
    console.error('Notification error:', err.message);
  }
}

// ส่ง email เมื่อยกเลิก
async function sendCancellationNotification(booking) {
  try {
    await axios.post(process.env.N8N_WEBHOOK_URL.replace('booking-notification', 'booking-cancellation'), {
      email: booking.user_email,
      name:  booking.user_name,
      date:  new Date(booking.start_time).toLocaleDateString('th-TH'),
      time:  `${new Date(booking.start_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} - ${new Date(booking.end_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`,
    });
  } catch (err) {
    console.error('Notification error:', err.message);
  }
}

module.exports = { sendBookingConfirmation, sendCancellationNotification };