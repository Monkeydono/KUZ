-- เก็บ Google OAuth tokens สำหรับเรียก Calendar API ในนาม user
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_access_token     TEXT,
  ADD COLUMN IF NOT EXISTS google_refresh_token    TEXT,
  ADD COLUMN IF NOT EXISTS google_token_expires_at TIMESTAMP;

-- ทุก booking มี event ใน Google Calendar ของหลายคน (owner + co-hosts)
-- เก็บ mapping เพื่อลบทีละ event ตอน cancel
CREATE TABLE IF NOT EXISTS booking_calendar_events (
  id              SERIAL PRIMARY KEY,
  booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_email      VARCHAR(255) NOT NULL,
  google_event_id VARCHAR(255) NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id, user_email)
);

CREATE INDEX IF NOT EXISTS idx_bce_booking ON booking_calendar_events(booking_id);
