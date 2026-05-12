SET client_encoding = 'UTF8';

-- รองรับ Zoom webhook events: meeting.started + meeting.ended
-- เก็บเวลาจริงที่ host กดเริ่ม/ปิด meeting แยกจาก scheduled start/end
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS actual_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actual_ended_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS participant_count INTEGER;

-- index สำหรับ query reporting "meeting ที่เริ่มจริง" + analytics
CREATE INDEX IF NOT EXISTS idx_bookings_actual_started
  ON bookings(actual_started_at) WHERE actual_started_at IS NOT NULL;
