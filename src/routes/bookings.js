const express = require('express');
const router = express.Router();
const bookingService = require('../services/bookingService');
const pool = require('../../config/db');

// GET /bookings/available?date=2026-04-30 — ดูช่วงเวลาที่ถูกจองในวันนั้น
router.get('/available', async (req, res, next) => {
  try {
    const { date } = req.query
    const result = await pool.query(
      `SELECT title, start_time, end_time FROM bookings
       WHERE status = 'confirmed'
         AND DATE(start_time AT TIME ZONE 'Asia/Bangkok') = $1
       ORDER BY start_time`,
      [date]
    )
    res.json(result.rows)
  } catch (err) {
    next(err)
  }
})

// GET /bookings — ดูรายการจองของตัวเอง
router.get('/', async (req, res, next) => {
  try {
    const bookings = await bookingService.getUserBookings(req.user.id);
    res.json(bookings);
  } catch (err) {
    next(err);
  }
});

// POST /bookings — จองห้อง
router.post('/', async (req, res, next) => {
  try {
    const { title, startTime, endTime } = req.body;
    const booking = await bookingService.createBooking({
      userId: req.user.id,
      title,
      startTime,
      endTime,
    });
    res.status(201).json(booking);
  } catch (err) {
    next(err);
  }
});

// DELETE /bookings/:id — ยกเลิกการจอง
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await bookingService.cancelBooking(req.params.id, req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;