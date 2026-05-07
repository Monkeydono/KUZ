const axios = require('axios');
const pool = require('../../config/db');
require('dotenv').config();

// ดึง access token ที่ valid — refresh ถ้าหมดอายุ
// คืน null ถ้า user ไม่มี refresh_token (ยังไม่เคย login หลังเพิ่ม scope)
async function getValidAccessToken(userEmail) {
  const r = await pool.query(
    `SELECT google_access_token, google_refresh_token, google_token_expires_at
       FROM users WHERE LOWER(email) = LOWER($1)`,
    [userEmail]
  );
  if (r.rows.length === 0) return null;
  const u = r.rows[0];
  if (!u.google_refresh_token) return null;

  // ยังใช้ได้อีก 60 วินาที — return cached token
  if (u.google_access_token && u.google_token_expires_at &&
      new Date(u.google_token_expires_at) > new Date(Date.now() + 60 * 1000)) {
    return u.google_access_token;
  }

  // refresh
  try {
    const params = new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: u.google_refresh_token,
      grant_type:    'refresh_token',
    });
    const res = await axios.post('https://oauth2.googleapis.com/token', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const newToken = res.data.access_token;
    const newExpiry = new Date(Date.now() + (res.data.expires_in || 3600) * 1000);
    await pool.query(
      `UPDATE users SET google_access_token = $1, google_token_expires_at = $2
         WHERE LOWER(email) = LOWER($3)`,
      [newToken, newExpiry, userEmail]
    );
    return newToken;
  } catch (err) {
    console.error('[gcal] refresh failed for', userEmail, err.response?.data || err.message);
    return null;
  }
}

async function createEvent(userEmail, { summary, description, startTime, endTime }) {
  const token = await getValidAccessToken(userEmail);
  if (!token) {
    console.warn(`[gcal] skip create event for ${userEmail} — no token (ต้อง re-login)`);
    return null;
  }

  try {
    const res = await axios.post(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        summary,
        description,
        start: { dateTime: startTime, timeZone: 'Asia/Bangkok' },
        end:   { dateTime: endTime,   timeZone: 'Asia/Bangkok' },
        reminders: { useDefault: true },
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data.id;
  } catch (err) {
    console.error(`[gcal] create event failed for ${userEmail}:`,
      err.response?.status, err.response?.data?.error?.message || err.message);
    return null;
  }
}

async function deleteEvent(userEmail, eventId) {
  const token = await getValidAccessToken(userEmail);
  if (!token) return;

  try {
    await axios.delete(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (err) {
    // 410 = ลบไปแล้ว, 404 = ไม่มี → OK ปล่อย
    const status = err.response?.status;
    if (status !== 404 && status !== 410) {
      console.error(`[gcal] delete event failed for ${userEmail}:`,
        status, err.response?.data?.error?.message || err.message);
    }
  }
}

// sync booking ไปยัง calendar ของ owner + co-host ทุกคน
async function syncToAttendees(booking, attendeeEmails) {
  const summary = `[KUZ] ${booking.title}`;
  const description = `จองห้อง Zoom\nลิงก์เข้า: ${booking.zoom_join_url || ''}`;

  for (const email of attendeeEmails) {
    const eventId = await createEvent(email, {
      summary,
      description,
      startTime: new Date(booking.start_time).toISOString(),
      endTime:   new Date(booking.end_time).toISOString(),
    });
    if (eventId) {
      try {
        await pool.query(
          `INSERT INTO booking_calendar_events (booking_id, user_email, google_event_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (booking_id, user_email) DO UPDATE SET google_event_id = $3`,
          [booking.id, email.toLowerCase(), eventId]
        );
      } catch (err) {
        console.error('[gcal] save event_id failed:', err.message);
      }
    }
  }
}

// ลบ event ของ booking นี้ออกจากทุก calendar ที่เคย sync
async function removeFromAttendees(bookingId) {
  const r = await pool.query(
    `SELECT user_email, google_event_id FROM booking_calendar_events WHERE booking_id = $1`,
    [bookingId]
  );
  for (const row of r.rows) {
    await deleteEvent(row.user_email, row.google_event_id);
  }
  // CASCADE จะลบ row ใน booking_calendar_events เองตอน booking ถูกลบ
  // แต่เราแค่ cancel (status), row ยังอยู่ — ลบทิ้งเอง
  await pool.query(`DELETE FROM booking_calendar_events WHERE booking_id = $1`, [bookingId]);
}

module.exports = { syncToAttendees, removeFromAttendees };
