const express = require('express');
const router = express.Router();
const inAppNotif = require('../services/inAppNotificationService');

router.get('/', async (req, res, next) => {
  try {
    const limit  = req.query.limit  || 20;
    const offset = req.query.offset || 0;
    const items = await inAppNotif.listForUser(req.user.id, { limit, offset });
    res.json(items);
  } catch (err) { next(err); }
});

router.get('/unread-count', async (req, res, next) => {
  try {
    const count = await inAppNotif.getUnreadCount(req.user.id);
    res.json({ count });
  } catch (err) { next(err); }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    const ok = await inAppNotif.markAsRead(req.params.id, req.user.id);
    if (!ok) return res.status(404).json({ error: 'ไม่พบ notification หรืออ่านแล้ว' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/read-all', async (req, res, next) => {
  try {
    const count = await inAppNotif.markAllAsRead(req.user.id);
    res.json({ marked: count });
  } catch (err) { next(err); }
});

module.exports = router;
