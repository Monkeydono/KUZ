SET client_encoding = 'UTF8';

-- in-app notifications (bell icon style)
CREATE TABLE IF NOT EXISTS notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  title        TEXT NOT NULL,
  message      TEXT,
  booking_id   UUID REFERENCES bookings(id) ON DELETE CASCADE,
  link         TEXT,
  is_read      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at      TIMESTAMPTZ
);

-- query bell icon: user_id + unread + sort by created_at DESC
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read, created_at DESC);

-- cleanup cron: หา notification ที่อ่านแล้วเก่ากว่า 30 วัน
CREATE INDEX IF NOT EXISTS idx_notifications_read_created
  ON notifications(read_at) WHERE is_read = true;

-- เก็บเหตุผลตอน staff/admin cancel booking ของคนอื่น
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by     UUID REFERENCES users(id);
