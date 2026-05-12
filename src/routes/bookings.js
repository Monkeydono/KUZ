const express = require('express');
const router = express.Router();
const bookingService = require('../services/bookingService');
const roomService = require('../services/roomService');
const pool = require('../../config/db');

// GET /bookings/rooms — list ห้องที่ user role ปัจจุบันจองได้
router.get('/rooms', async (req, res, next) => {
  try {
    const rooms = await roomService.listAvailableRooms(req.user.role);
    res.json(rooms);
  } catch (err) {
    next(err);
  }
});

router.get('/available', async (req, res, next) => {
  try {
    const { date, roomId, capacity } = req.query;

    // 3 modes: capacity tier (preferred) | specific roomId | default room
    let roomIds;
    if (capacity) {
      const cap = parseInt(capacity, 10);
      roomIds = await roomService.getRoomIdsByCapacity(cap, req.user.role);
    } else if (roomId) {
      roomIds = [roomId];
    } else {
      const def = await roomService.getDefaultRoomId();
      roomIds = def ? [def] : [];
    }

    if (roomIds.length === 0) {
      return res.json({ total_rooms: 0, bookings: [] });
    }

    // รวม pending_approval ด้วย — slot ถูกจองเสมือนแล้ว (กัน double-book + แสดงให้คนอื่นเห็นว่าไม่ว่าง)
    const result = await pool.query(
      `SELECT start_time, end_time, room_id,
              (user_id = $2) AS is_mine,
              EXISTS (
                SELECT 1 FROM unnest(co_host_emails) AS ch(email)
                 WHERE LOWER(ch.email) = LOWER($3)
              ) AS is_co_host
         FROM bookings
        WHERE status IN ('confirmed', 'pending_approval')
          AND DATE(start_time AT TIME ZONE 'Asia/Bangkok') = $1
          AND room_id = ANY($4::uuid[])
        ORDER BY start_time`,
      [date, req.user.id, req.user.email, roomIds]
    );
    res.json({ total_rooms: roomIds.length, bookings: result.rows });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    const bookings = await bookingService.getUserBookings(req.user.id, req.user.email, { limit, offset });
    res.json(bookings);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, startTime, endTime, coHostEmails, recurring, roomId, capacity, notes } = req.body;
    const args = {
      userId:    req.user.id,
      userEmail: req.user.email,
      userRole:  req.user.role,
      title,
      startTime,
      endTime,
      coHostEmails,
      roomId,
      capacity,
      notes,
    };
    if (recurring && recurring.count > 1) {
      const list = await bookingService.createRecurringBooking({ ...args, recurring });
      res.status(201).json({ series: true, count: list.length, bookings: list });
    } else {
      const booking = await bookingService.createBooking(args);
      res.status(201).json(booking);
    }
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const scope  = req.query.scope || 'this';
    const reason = req.body?.reason || req.query.reason || null;
    const result = await bookingService.cancelBooking(
      req.params.id, req.user.id, req.user.role, scope, reason
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/join', async (req, res, next) => {
  try {
    const info = await bookingService.getJoinInfo(req.params.id, req.user);
    res.json(info);
  } catch (err) {
    if (err.status === 425) {
      return res.status(425).json({ error: err.message, startsAt: err.startsAt });
    }
    next(err);
  }
});

module.exports = router;
