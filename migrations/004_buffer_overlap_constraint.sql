-- บังคับ buffer 1 นาทีระหว่าง booking
-- 10:00-10:30 จองได้, 10:30-11:00 จะถูกปฏิเสธ — ต้อง 10:31 ขึ้นไป

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    tsrange(start_time, end_time + interval '1 minute', '[)') WITH &&
  ) WHERE (status = 'confirmed');
