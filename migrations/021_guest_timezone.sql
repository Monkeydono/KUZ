SET client_encoding = 'UTF8';

-- เขตเวลาของผู้เข้าร่วมต่างชาติ (feedback Rev.1 ข้อ 12)
-- เวลาจองเก็บเป็น TIMESTAMPTZ อยู่แล้ว คอลัมน์นี้ใช้แค่แสดงผล
--   ตั้ง timezone ของห้อง Zoom และแนบเวลาที่แปลงแล้วไปในอีเมล
-- NULL = ใช้เวลาไทย
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS guest_timezone TEXT;
