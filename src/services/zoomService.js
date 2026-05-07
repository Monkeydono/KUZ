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

async function createMeeting({ title, startTime, durationMinutes }) {
  const token = await getZoomToken();

  // ไม่ส่ง alternative_hosts ไป Zoom — co-host เก็บเป็น metadata ใน KUZ เท่านั้น
  // (Zoom alternative_hosts บังคับ licensed user ใน account เดียวกัน เลยใช้ไม่สะดวก)
  const settings = {
    join_before_host: false,
    waiting_room:     true,
  };

  try {
    const response = await axios.post(
      'https://api.zoom.us/v2/users/me/meetings',
      {
        topic:      title,
        type:       2,
        start_time: startTime,
        duration:   durationMinutes,
        timezone:   'Asia/Bangkok',
        settings,
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    return {
      meetingId:  response.data.id,
      joinUrl:    response.data.join_url,
      password:   response.data.password,
    };
  } catch (err) {
    // surface Zoom error ให้ caller รู้รายละเอียด — สำหรับ debug + error message ที่เจาะจง
    const data = err.response?.data;
    console.error('[Zoom create meeting failed]', err.response?.status, data);
    const msg = data?.message || err.message;
    const e = new Error(msg);
    e.zoomCode = data?.code;
    e.zoomStatus = err.response?.status;
    e.zoomMessage = msg;
    throw e;
  }
}

async function deleteMeeting(meetingId) {
  const token = await getZoomToken();

  await axios.delete(
    `https://api.zoom.us/v2/meetings/${meetingId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

module.exports = { createMeeting, deleteMeeting };
