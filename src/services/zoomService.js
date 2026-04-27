const axios = require('axios');
require('dotenv').config();

// ขอ Access Token จาก Zoom
async function getZoomToken() {
  const credentials = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64');

  const response = await axios.post(
    'https://zoom.us/oauth/token?grant_type=account_credentials' +
    `&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
    {},
    { headers: { Authorization: `Basic ${credentials}` } }
  );

  return response.data.access_token;
}

// สร้าง Zoom Meeting
async function createMeeting({ title, startTime, durationMinutes }) {
  const token = await getZoomToken();

  const response = await axios.post(
    'https://api.zoom.us/v2/users/me/meetings',
    {
      topic:      title,
      type:       2, // scheduled meeting
      start_time: startTime, // ISO 8601 เช่น "2026-04-27T10:00:00Z"
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

// ลบ Zoom Meeting
async function deleteMeeting(meetingId) {
  const token = await getZoomToken();

  await axios.delete(
    `https://api.zoom.us/v2/meetings/${meetingId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

module.exports = { createMeeting, deleteMeeting };