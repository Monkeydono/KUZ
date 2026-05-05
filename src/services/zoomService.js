const axios = require('axios');
require('dotenv').config();

// Cache token in-memory — Zoom S2S token อายุ ~1 ชม.
// refresh ก่อนหมด 1 นาทีเพื่อกัน race
let cachedToken = null;
let cachedExpiry = 0;

async function getZoomToken() {
  if (cachedToken && Date.now() < cachedExpiry - 60000) {
    return cachedToken;
  }

  const credentials = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64');

  const response = await axios.post(
    'https://zoom.us/oauth/token?grant_type=account_credentials' +
    `&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
    {},
    { headers: { Authorization: `Basic ${credentials}` } }
  );

  cachedToken = response.data.access_token;
  cachedExpiry = Date.now() + (response.data.expires_in * 1000);
  return cachedToken;
}

async function createMeeting({ title, startTime, durationMinutes }) {
  const token = await getZoomToken();

  const response = await axios.post(
    'https://api.zoom.us/v2/users/me/meetings',
    {
      topic:      title,
      type:       2,
      start_time: startTime,
      duration:   durationMinutes,
      timezone:   'Asia/Bangkok',
      settings: {
        join_before_host: true,
        waiting_room:     false,
      }
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return {
    meetingId:  response.data.id,
    joinUrl:    response.data.join_url,
    password:   response.data.password,
  };
}

async function deleteMeeting(meetingId) {
  const token = await getZoomToken();

  await axios.delete(
    `https://api.zoom.us/v2/meetings/${meetingId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

module.exports = { createMeeting, deleteMeeting };
