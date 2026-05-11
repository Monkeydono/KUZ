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
    const { date, roomId } = req.query;
    // ถ้าไม่ส่ง roomId → ใช้ default room (เพื่อ backward compat)
    const targetRoom = roomId || await roomService.getDefaultRoomId();
    const result = await pool.query(
      `SELECT start_time, end_time,
              (user_id = $2) AS is_mine,
              EXISTS (
                SELECT 1 FROM unnest(co_host_emails) AS ch(email)
                 WHERE LOWER(ch.email) = LOWER($3)
              ) AS is_co_host
         FROM bookings
        WHERE status = 'confirmed'
          AND DATE(start_time AT TIME ZONE 'Asia/Bangkok') = $1
          AND ($4::uuid IS NULL OR room_id = $4)
        ORDER BY start_time`,
      [date, req.user.id, req.user.email, targetRoom]
    );
    res.json(result.rows);
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
    const { title, startTime, endTime, coHostEmails, recurring, roomId, notes } = req.body;
    const args = {
      userId:    req.user.id,
      userEmail: req.user.email,
      userRole:  req.user.role,
      title,
      startTime,
      endTime,
      coHostEmails,
      roomId,
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
    const scope = req.query.scope || 'this';
    const result = await bookingService.cancelBooking(
      req.params.id, req.user.id, req.user.role, scope
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
