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

async function createMeeting({ title, startTime, durationMinutes, creds = null, coHostEmails = [] }) {
  const token = await getZoomToken(creds);

  const settings = {
    join_before_host: false,
    waiting_room:     true,
  };

  // alternative_hosts = co-host ที่ Zoom จะมอบสิทธิ์ host ให้ (ต้องเป็น licensed user ใน Zoom org)
  // ถ้าไม่ใช่ licensed ใน org → Zoom จะ reject — เราจะ retry โดยไม่ใส่ alternative_hosts
  // (co-host invite tracking ฝั่ง app ทำผ่าน co_host_emails + email invite อยู่แล้ว)
  if (coHostEmails && coHostEmails.length > 0) {
    settings.alternative_hosts = coHostEmails.join(',');
    settings.alternative_hosts_email_notification = false; // เราส่ง email เองผ่าน n8n
  }

  const body = {
    topic:      title,
    type:       2,
    start_time: startTime,
    duration:   durationMinutes,
    timezone:   'Asia/Bangkok',
    settings,
  };

  const tryCreate = async (payload) => axios.post(
    'https://api.zoom.us/v2/users/me/meetings',
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  let response;
  try {
    response = await tryCreate(body);
  } catch (err) {
    const data = err.response?.data;
    // Zoom error 1115 / 3001 = alternative host email invalid → retry without alternative_hosts
    if (settings.alternative_hosts && (data?.code === 1115 || data?.code === 3001 || err.response?.status === 400)) {
      console.warn('[Zoom] alternative_hosts rejected — retry without:', data?.message);
      delete settings.alternative_hosts;
      delete settings.alternative_hosts_email_notification;
      try {
        response = await tryCreate(body);
      } catch (err2) {
        const data2 = err2.response?.data;
        console.error('[Zoom create meeting failed]', err2.response?.status, data2);
        const msg = data2?.message || err2.message;
        const e = new Error(msg);
        e.zoomCode = data2?.code;
        e.zoomStatus = err2.response?.status;
        throw e;
      }
    } else {
      console.error('[Zoom create meeting failed]', err.response?.status, data);
      const msg = data?.message || err.message;
      const e = new Error(msg);
      e.zoomCode = data?.code;
      e.zoomStatus = err.response?.status;
      throw e;
    }
  }

  return {
    meetingId:  response.data.id,
    joinUrl:    response.data.join_url,
    password:   response.data.password,
  };
}

async function deleteMeeting(meetingId, creds = null) {
  const token = await getZoomToken(creds);

  await axios.delete(
    `https://api.zoom.us/v2/meetings/${meetingId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

// ดึง start_url สด (มี ZAK token อายุสั้น ~2 ชม.) สำหรับให้เจ้าของเริ่มประชุมเป็น host
// ต้อง fetch ตอนจะเริ่มจริง เพราะ start_url ตอนสร้าง meeting หมดอายุก่อนถึงเวลาประชุม
async function getStartUrl(meetingId, creds = null) {
  const token = await getZoomToken(creds);
  const res = await axios.get(
    `https://api.zoom.us/v2/meetings/${meetingId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.start_url;
}

// หา zoom_account ของ meeting จาก database (สำหรับ webhook ที่ส่ง meeting_id มา)
// webhook signature verification — ใช้ HMAC SHA256 ของ payload + Zoom verification token
function verifyWebhookSignature(body, headers, secretToken) {
  if (!secretToken) return false;
  const crypto = require('crypto');
  const message = `v0:${headers['x-zm-request-timestamp']}:${typeof body === 'string' ? body : JSON.stringify(body)}`;
  const hash = crypto.createHmac('sha256', secretToken).update(message).digest('hex');
  const signature = `v0=${hash}`;
  return signature === headers['x-zm-signature'];
}

// ดึง info ของ recording (เรียกใช้กรณี webhook payload ไม่ได้ส่ง recording_files มาครบ)
// requires Zoom Cloud Recording feature (Pro plan ขึ้นไป)
async function getMeetingRecordings(meetingId, creds = null) {
  const token = await getZoomToken(creds);
  try {
    const res = await axios.get(
      `https://api.zoom.us/v2/meetings/${meetingId}/recordings`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data; // { recording_files: [...], download_access_token: '...' }
  } catch (err) {
    console.error('[Zoom getMeetingRecordings]', err.response?.status, err.response?.data);
    throw err;
  }
}

// download recording file เป็น stream — caller pipe ไป upload Drive
// webhook ส่ง download_token มาในแต่ละ event → ใช้เป็น Bearer แทน OAuth token
async function downloadRecordingStream(downloadUrl, downloadToken) {
  if (!downloadUrl || !downloadToken) {
    throw new Error('downloadUrl + downloadToken required');
  }
  const res = await axios.get(downloadUrl, {
    headers: { Authorization: `Bearer ${downloadToken}` },
    responseType: 'stream',
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
  return res; // axios response with .data = stream
}

module.exports = {
  createMeeting, deleteMeeting, getStartUrl, verifyWebhookSignature,
  getMeetingRecordings, downloadRecordingStream,
};
