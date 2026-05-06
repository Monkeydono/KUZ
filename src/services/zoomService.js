const axios = require('axios');
require('dotenv').config();

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

async function createMeeting({ title, startTime, durationMinutes, coHostEmails = [] }) {
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
        // กันคนเข้าก่อน host มาเปิดห้อง — ใช้ร่วมกับ /join page
        // ที่ block ไม่ให้ user เข้าก่อนเวลาด้วย
        join_before_host: false,
        waiting_room:     true,
        // ตั้ง co-host ผ่าน alternative_hosts (ต้อง Zoom Pro+ licensed)
        // ถ้าใช้ Free จะถูก ignore — host ต้อง promote in-meeting แทน
        alternative_hosts: coHostEmails.join(','),
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
