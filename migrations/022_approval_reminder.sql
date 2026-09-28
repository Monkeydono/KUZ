SET client_encoding = 'UTF8';

-- เตือนผู้อนุมัติซ้ำเมื่อคำขอค้างนาน (feedback Rev.1 ข้อ 5: ป้องกัน Admin ลืมอนุมัติ)
-- เก็บเวลาที่เตือนล่าสุด เพื่อไม่ให้เตือนถี่เกินไป
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS approval_reminded_at TIMESTAMPTZ;
