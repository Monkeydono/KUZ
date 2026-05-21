SET client_encoding = 'UTF8';

-- เก็บข้อมูลการประชุมไว้ใน Google Drive ของผู้จองแต่ละคน
-- ปัจจุบัน (Free plan): metadata Google Doc
-- อนาคต (Pro plan): + recording + chat + transcript

-- cache root folder "KU Zoom Bookings" ของแต่ละ user (กันสร้างซ้ำ)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_drive_root_id TEXT;

-- mapping booking → Google Drive files
CREATE TABLE IF NOT EXISTS booking_drive_files (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  file_type      TEXT NOT NULL,
                 -- 'folder' | 'metadata' | 'recording' | 'chat' | 'transcript'
  drive_file_id  TEXT NOT NULL,
  drive_url      TEXT,
  mime_type      TEXT,
  file_name      TEXT,
  size_bytes     BIGINT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id, file_type, drive_file_id)
);

CREATE INDEX IF NOT EXISTS idx_booking_drive_files_booking
  ON booking_drive_files(booking_id);
