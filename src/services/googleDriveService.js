const axios = require('axios');
const pool = require('../../config/db');

// reuse token refresh logic จาก googleCalendarService — แต่ load แบบ local เพื่อกัน circular dep
async function getValidAccessToken(userEmail) {
  const r = await pool.query(
    `SELECT google_access_token, google_refresh_token, google_token_expires_at
       FROM users WHERE LOWER(email) = LOWER($1)`,
    [userEmail]
  );
  if (r.rows.length === 0) return null;
  const u = r.rows[0];
  if (!u.google_refresh_token) return null;

  if (u.google_access_token && u.google_token_expires_at &&
      new Date(u.google_token_expires_at) > new Date(Date.now() + 60 * 1000)) {
    return u.google_access_token;
  }

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
    console.error('[gdrive] refresh failed for', userEmail, err.response?.data || err.message);
    return null;
  }
}

const ROOT_FOLDER_NAME = 'KU Zoom Bookings';

// สร้างหรือดึง root folder "KU Zoom Bookings" ใน Drive ของ user — cache id ใน users
async function ensureRootFolder(userId, userEmail) {
  const r = await pool.query(`SELECT google_drive_root_id FROM users WHERE id = $1`, [userId]);
  if (r.rows[0]?.google_drive_root_id) {
    return r.rows[0].google_drive_root_id;
  }

  const token = await getValidAccessToken(userEmail);
  if (!token) return null;

  try {
    // เช็คก่อนว่ามี folder ชื่อนี้อยู่แล้วใน Drive ของ user (กรณี cache หาย)
    const searchRes = await axios.get(
      'https://www.googleapis.com/drive/v3/files',
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          q: `name='${ROOT_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and 'me' in owners and trashed=false`,
          fields: 'files(id)',
        },
      }
    );
    let folderId = searchRes.data.files?.[0]?.id;

    if (!folderId) {
      const createRes = await axios.post(
        'https://www.googleapis.com/drive/v3/files',
        {
          name: ROOT_FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      folderId = createRes.data.id;
    }

    await pool.query(
      `UPDATE users SET google_drive_root_id = $1 WHERE id = $2`,
      [folderId, userId]
    );
    return folderId;
  } catch (err) {
    console.error('[gdrive] ensureRootFolder failed:', err.response?.data || err.message);
    return null;
  }
}

// สร้าง subfolder สำหรับ booking เฉพาะ + เก็บใน booking_drive_files
async function createBookingFolder(booking, userEmail) {
  const token = await getValidAccessToken(userEmail);
  if (!token) {
    console.warn(`[gdrive] skip createBookingFolder — no token for ${userEmail}`);
    return null;
  }

  const rootId = await ensureRootFolder(booking.user_id, userEmail);
  if (!rootId) return null;

  // ชื่อ folder: YYYY-MM-DD HH:mm — title
  const start = new Date(booking.start_time);
  const dateStr = start.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  const timeStr = start.toLocaleTimeString('en-CA', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const safeName = booking.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  const folderName = `${dateStr} ${timeStr} — ${safeName}`;

  try {
    const res = await axios.post(
      'https://www.googleapis.com/drive/v3/files',
      {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [rootId],
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { fields: 'id, webViewLink' },
      }
    );
    const folderId = res.data.id;
    const folderUrl = res.data.webViewLink || `https://drive.google.com/drive/folders/${folderId}`;

    await pool.query(
      `INSERT INTO booking_drive_files (booking_id, file_type, drive_file_id, drive_url, mime_type, file_name)
       VALUES ($1, 'folder', $2, $3, 'application/vnd.google-apps.folder', $4)
       ON CONFLICT (booking_id, file_type, drive_file_id) DO NOTHING`,
      [booking.id, folderId, folderUrl, folderName]
    );
    return { folderId, folderUrl };
  } catch (err) {
    console.error('[gdrive] createBookingFolder failed:', err.response?.data || err.message);
    return null;
  }
}

// สร้าง Google Doc เก็บ metadata ของ booking
async function saveBookingMetadata(booking, userEmail, folderId) {
  const token = await getValidAccessToken(userEmail);
  if (!token || !folderId) return null;

  const start = new Date(booking.start_time);
  const end = new Date(booking.end_time);
  const fmtDate = (d) => d.toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });
  const fmtTime = (d) => d.toLocaleTimeString('th-TH', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit',
  });

  const content =
`บันทึกการจองห้องประชุม Zoom — KU Zoom Booking
══════════════════════════════════════════════════

${booking.title}

วันที่: ${fmtDate(start)}
เวลา:  ${fmtTime(start)} – ${fmtTime(end)}
ห้อง:  ${booking.room_name || '-'}${booking.room_capacity ? ` (${booking.room_capacity} คน)` : ''}

ผู้จอง: ${booking.user_name || ''} <${booking.user_email || ''}>

${booking.co_host_emails?.length > 0
  ? 'Co-hosts:\n' + booking.co_host_emails.map(e => `   - ${e}`).join('\n')
  : 'Co-hosts: -'}

${booking.zoom_join_url
  ? `Zoom join URL:\n   ${booking.zoom_join_url}\n${booking.zoom_password ? `Password: ${booking.zoom_password}` : ''}`
  : 'สถานะ: รออนุมัติ — Zoom link ยังไม่ถูกสร้าง'}

${booking.notes
  ? `หมายเหตุ / เหตุผลการจอง:\n${booking.notes}`
  : ''}

──────────────────────────────────────────────────
สร้างโดยระบบ KU Zoom Booking — ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}
booking_id: ${booking.id}
`;

  try {
    // multipart upload — สร้าง Google Doc (Drive convert จาก text/plain)
    const boundary = '-------kuz_boundary_' + Date.now();
    const metadata = {
      name: `Meeting Notes — ${booking.title}`.slice(0, 200),
      mimeType: 'application/vnd.google-apps.document',
      parents: [folderId],
    };
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) + '\r\n' +
      `--${boundary}\r\n` +
      `Content-Type: text/plain; charset=UTF-8\r\n\r\n` +
      content + '\r\n' +
      `--${boundary}--`;

    const res = await axios.post(
      'https://www.googleapis.com/upload/drive/v3/files',
      body,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        params: { uploadType: 'multipart', fields: 'id, webViewLink' },
      }
    );
    const fileId = res.data.id;
    const fileUrl = res.data.webViewLink;

    await pool.query(
      `INSERT INTO booking_drive_files (booking_id, file_type, drive_file_id, drive_url, mime_type, file_name)
       VALUES ($1, 'metadata', $2, $3, 'application/vnd.google-apps.document', $4)
       ON CONFLICT (booking_id, file_type, drive_file_id) DO NOTHING`,
      [booking.id, fileId, fileUrl, metadata.name]
    );
    return { fileId, fileUrl };
  } catch (err) {
    console.error('[gdrive] saveBookingMetadata failed:', err.response?.data || err.message);
    return null;
  }
}

// orchestrator: สร้าง folder + เก็บ metadata ในคราวเดียว — best-effort, ไม่ throw
async function archiveBooking(booking) {
  if (!booking?.user_email) {
    console.warn('[gdrive] archiveBooking: missing user_email');
    return;
  }
  try {
    const folder = await createBookingFolder(booking, booking.user_email);
    if (!folder) return;
    await saveBookingMetadata(booking, booking.user_email, folder.folderId);
    console.log(`[gdrive] archived booking ${booking.id} → ${folder.folderUrl}`);
  } catch (err) {
    console.error('[gdrive] archiveBooking error:', err.message);
  }
}

// upload ไฟล์จาก stream เข้า Drive folder — ใช้ resumable upload (รองรับไฟล์ใหญ่)
// stream = readable stream (เช่น axios response.data จาก downloadRecordingStream)
// userEmail = เจ้าของ Drive ที่จะเก็บ
async function uploadStreamToFolder(userEmail, folderId, { stream, fileName, mimeType, sizeBytes }) {
  const token = await getValidAccessToken(userEmail);
  if (!token || !folderId) return null;

  try {
    // step 1: initiate resumable upload — ได้ upload URL
    const initRes = await axios.post(
      'https://www.googleapis.com/upload/drive/v3/files',
      {
        name: fileName,
        mimeType,
        parents: [folderId],
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': mimeType,
          ...(sizeBytes ? { 'X-Upload-Content-Length': String(sizeBytes) } : {}),
        },
        params: { uploadType: 'resumable', fields: 'id, webViewLink, size' },
      }
    );
    const uploadUrl = initRes.headers['location'];
    if (!uploadUrl) throw new Error('no upload URL from Drive');

    // step 2: PUT stream → Drive (axios จะ stream อัตโนมัติถ้า data เป็น stream)
    const putRes = await axios.put(uploadUrl, stream, {
      headers: {
        'Content-Type': mimeType,
        ...(sizeBytes ? { 'Content-Length': String(sizeBytes) } : {}),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    return {
      fileId:   putRes.data.id,
      fileUrl:  putRes.data.webViewLink,
      fileSize: putRes.data.size ? parseInt(putRes.data.size, 10) : sizeBytes,
    };
  } catch (err) {
    console.error('[gdrive] uploadStreamToFolder failed:', err.response?.data || err.message);
    return null;
  }
}

// บันทึก recording (หรือ chat/transcript) เข้า Drive folder ของ booking
// fileType: 'recording' | 'chat' | 'transcript'
async function archiveRecordingFile(booking, downloadUrl, downloadToken, { fileType, fileName, mimeType, sizeBytes }) {
  const zoomService = require('./zoomService');

  // หา folder ของ booking ใน DB (สร้างไว้ตอน archive metadata)
  const r = await pool.query(
    `SELECT drive_file_id FROM booking_drive_files
      WHERE booking_id = $1 AND file_type = 'folder' LIMIT 1`,
    [booking.id]
  );
  let folderId = r.rows[0]?.drive_file_id;

  // ถ้ายังไม่มี folder (กรณี edge case) → สร้างใหม่
  if (!folderId) {
    const folder = await createBookingFolder(booking, booking.user_email);
    if (!folder) return null;
    folderId = folder.folderId;
  }

  // stream download จาก Zoom → upload เข้า Drive
  let dlRes;
  try {
    dlRes = await zoomService.downloadRecordingStream(downloadUrl, downloadToken);
  } catch (err) {
    console.error('[gdrive] download from Zoom failed:', err.message);
    return null;
  }

  const upload = await uploadStreamToFolder(booking.user_email, folderId, {
    stream: dlRes.data,
    fileName,
    mimeType,
    sizeBytes: sizeBytes || parseInt(dlRes.headers['content-length'] || '0', 10) || null,
  });
  if (!upload) return null;

  await pool.query(
    `INSERT INTO booking_drive_files (booking_id, file_type, drive_file_id, drive_url, mime_type, file_name, size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (booking_id, file_type, drive_file_id) DO NOTHING`,
    [booking.id, fileType, upload.fileId, upload.fileUrl, mimeType, fileName, upload.fileSize || null]
  );
  return upload;
}

// ดึง drive files ของ booking — ใช้สำหรับ frontend แสดงลิงก์
async function getBookingFiles(bookingId) {
  const r = await pool.query(
    `SELECT file_type, drive_file_id, drive_url, file_name
       FROM booking_drive_files
      WHERE booking_id = $1
      ORDER BY created_at ASC`,
    [bookingId]
  );
  return r.rows;
}

module.exports = {
  archiveBooking,
  createBookingFolder,
  saveBookingMetadata,
  ensureRootFolder,
  getBookingFiles,
  archiveRecordingFile,
  uploadStreamToFolder,
};
