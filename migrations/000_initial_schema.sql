-- Initial schema สำหรับ KUZ
-- รันก่อน 001_no_overlap_constraint.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- users
CREATE TABLE IF NOT EXISTS users (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email      VARCHAR(255) UNIQUE NOT NULL,
  name       VARCHAR(255),
  role       VARCHAR(20) NOT NULL DEFAULT 'student'
             CHECK (role IN ('student', 'admin')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- bookings
CREATE TABLE IF NOT EXISTS bookings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           VARCHAR(200) NOT NULL,
  start_time      TIMESTAMP NOT NULL,
  end_time        TIMESTAMP NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'confirmed'
                  CHECK (status IN ('confirmed', 'cancelled', 'completed')),
  zoom_meeting_id VARCHAR(64),
  zoom_join_url   TEXT,
  zoom_password   VARCHAR(64),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT bookings_time_valid CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_bookings_user_start
  ON bookings(user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_status_start
  ON bookings(status, start_time);

-- quota รายเดือน (composite unique key)
CREATE TABLE IF NOT EXISTS quota (
  id         SERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month      DATE NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0,
  max_count  INTEGER NOT NULL DEFAULT 4,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, month)
);

-- เปลี่ยนสถานะ booking ที่ผ่านเวลาสิ้นสุดแล้วเป็น 'completed'
-- เรียกจาก cron job ใน src/server.js ทุก 5 นาที
CREATE OR REPLACE FUNCTION auto_complete_bookings()
RETURNS void AS $$
BEGIN
  UPDATE bookings
     SET status = 'completed'
   WHERE status = 'confirmed'
     AND end_time < NOW();
END;
$$ LANGUAGE plpgsql;
