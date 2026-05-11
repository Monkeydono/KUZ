SET client_encoding = 'UTF8';

-- หมายเหตุการจอง — เหตุผลที่ผู้จองใช้ห้อง (สำหรับ staff/admin moderation)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS notes TEXT;
