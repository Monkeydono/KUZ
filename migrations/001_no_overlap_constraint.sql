-- กัน race condition ตอน insert booking ที่ทับเวลากัน
-- exclusion constraint จะ reject แม้ 2 transaction insert พร้อมกัน
-- (CHECK + SELECT แยกกันใน application layer ป้องกันไม่ได้)

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    tsrange(start_time, end_time, '[)') WITH &&
  ) WHERE (status = 'confirmed');
