const express = require('express');
const router = express.Router();
const bookingService = require('../services/bookingService');

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