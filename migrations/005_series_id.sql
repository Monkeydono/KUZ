-- จับกลุ่ม booking ที่จองแบบ recurring (ทุกสัปดาห์ ฯลฯ)
-- null = single booking, non-null = belongs to series

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS series_id UUID;

CREATE INDEX IF NOT EXISTS idx_bookings_series
  ON bookings(series_id)
  WHERE series_id IS NOT NULL;
