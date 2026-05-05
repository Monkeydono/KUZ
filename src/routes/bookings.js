const express = require('express');
const router = express.Router();
const bookingService = require('../services/bookingService');
const pool = require('../../config/db');

// GET /bookings/available?date=2026-04-30 — ส่งแค่ช่วงเวลาที่ถูกจอง
// ไม่ส่ง title เพราะอาจมีข้อมูลส่วนตัว
router.get('/available', async (req, res, next) => {
  try {
    const { date } = req.query;
    const result = await pool.query(
      `SELECT start_time, end_time FROM bookings
       WHERE status = 'confirmed'
         AND DATE(start_time AT TIME ZONE 'Asia/Bangkok') = $1
       ORDER BY start_time`,
      [date]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /bookings — รายการจองของตัวเอง
router.get('/', async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    const bookings = await bookingService.getUserBookings(req.user.id, { limit, offset });
    res.json(bookings);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, startTime, endTime } = req.body;
    const booking = await bookingService.createBooking({
      userId: req.user.id,
      userRole: req.user.role,
      title,
      startTime,
      endTime,
    });
    res.status(201).json(booking);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await bookingService.cancelBooking(req.params.id, req.user.id, req.user.role);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
