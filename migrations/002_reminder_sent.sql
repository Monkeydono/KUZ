-- เก็บ flag ว่าส่ง reminder email 15 นาทีก่อนประชุมไปแล้วหรือยัง
-- ใช้กัน duplicate ส่งซ้ำเมื่อ cron วิ่งหลายรอบ

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN NOT NULL DEFAULT false;

-- index ช่วย cron query เร็ว — ดึงเฉพาะ confirmed ที่ยังไม่ได้ส่ง reminder
CREATE INDEX IF NOT EXISTS idx_bookings_pending_reminder
  ON bookings (start_time)
  WHERE status = 'confirmed' AND reminder_sent = false;
