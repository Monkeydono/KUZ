const axios = require('axios');
require('dotenv').config();

// cache token แยกตาม account_id เพื่อให้รองรับหลาย Zoom account ได้
const tokenCache = new Map(); // accountId → { token, expiry }

function envCreds() {
  return {
    accountId:    process.env.ZOOM_ACCOUNT_ID,
    clientId:     process.env.ZOOM_CLIENT_ID,
    clientSecret: process.env.ZOOM_CLIENT_SECRET,
  };
}

async function getZoomToken(creds = null) {
  const c = creds || envCreds();
  if (!c.accountId || !c.clientId || !c.clientSecret) {
    throw new Error('Zoom credentials ไม่ครบ (ตรวจ ENV หรือ zoom_accounts row)');
  }

  const cached = tokenCache.get(c.accountId);
  if (cached && Date.now() < cached.expiry - 60000) {
    return cached.token;
  }

  const credentials = Buffer.from(
    `${c.clientId}:${c.clientSecret}`
  ).toString('base64');

  const response = await axios.post(
    'https://zoom.us/oauth/token?grant_type=account_credentials' +
    `&account_id=${c.accountId}`,
    {},
    { headers: { Authorization: `Basic ${credentials}` } }
  );

  tokenCache.set(c.accountId, {
    token:  response.data.access_token,
    expiry: Date.now() + (response.data.expires_in * 1000),
  });
  return response.data.access_token;
}

async function createMeeting({ title, startTime, durationMinutes, creds = null }) {
  const token = await getZoomToken(creds);

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

async function deleteMeeting(meetingId, creds = null) {
  const token = await getZoomToken(creds);

  await axios.delete(
    `https://api.zoom.us/v2/meetings/${meetingId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

module.exports = { createMeeting, deleteMeeting };
