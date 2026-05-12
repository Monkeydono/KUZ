const express = require('express');
const router = express.Router();
const bookingService = require('../services/bookingService');
const zoomService = require('../services/zoomService');
const auditService = require('../services/auditService');

const SECRET = process.env.ZOOM_WEBHOOK_SECRET_TOKEN || '';

// POST /webhooks/zoom — รับ event จาก Zoom (meeting.started, meeting.ended ฯลฯ)
// Zoom เรียก endpoint นี้แบบ unauthenticated → ต้อง verify ผ่าน HMAC signature
router.post('/zoom', async (req, res) => {
  const event = req.body;

  // Zoom URL validation challenge — ตอน admin ตั้ง webhook URL ใหม่ใน Zoom marketplace
  if (event && event.event === 'endpoint.url_validation') {
    const crypto = require('crypto');
    const plainToken = event.payload?.plainToken;
    if (!plainToken || !SECRET) {
      return res.status(400).json({ error: 'missing plainToken or secret' });
    }
    const hash = crypto.createHmac('sha256', SECRET).update(plainToken).digest('hex');
    return res.json({ plainToken, encryptedToken: hash });
  }

  // Signature verification (skip ถ้าไม่ set secret — สำหรับ dev เท่านั้น)
  if (SECRET) {
    const ok = zoomService.verifyWebhookSignature(req.body, req.headers, SECRET);
    if (!ok) {
      console.warn('[zoom-webhook] invalid signature', req.headers['x-zm-signature']);
      return res.status(401).json({ error: 'invalid signature' });
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.error('[zoom-webhook] ZOOM_WEBHOOK_SECRET_TOKEN not set in production!');
    return res.status(500).json({ error: 'webhook secret not configured' });
  }

  // process event (best-effort — webhook ต้องตอบ 200 เร็ว)
  try {
    const result = await bookingService.handleZoomWebhookEvent(event);
    if (result.handled) {
      console.log(`[zoom-webhook] ${event.event} → updated ${result.updated || 0} booking(s)`);
    }
    // log สำหรับ debug
    if (event.event && event.payload?.object?.id) {
      try {
        await auditService.log({
          userId: null,
          action: `zoom_webhook_${event.event.replace(/\./g, '_')}`,
          detail: { meeting_id: String(event.payload.object.id), handled: result.handled },
        });
      } catch (e) { /* audit failure shouldn't break webhook */ }
    }
  } catch (err) {
    console.error('[zoom-webhook] handler error:', err.message);
  }

  // เสมอ return 200 เร็วๆ — Zoom retry ถ้าเรา timeout
  res.json({ ok: true });
});

module.exports = router;
