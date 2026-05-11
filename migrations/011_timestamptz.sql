SET client_encoding = 'UTF8';

-- ลบ booking test เก่าทิ้ง (data ตอน TIMESTAMP ที่ TZ ambiguous)
DELETE FROM bookings WHERE title IN ('series test', 'norm test');

-- 1. DROP constraints ที่กระทบ ALTER COLUMN ของ start_time/end_time
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS chk_max_duration;  -- block Pro plan > 40 นาที — ย้ายไป app layer
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS chk_time_order;     -- จะ recreate ใหม่
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_time_valid; -- จาก migration 000

-- 2. atomic ALTER start_time + end_time พร้อมกัน (กัน mid-step type mismatch)
-- ถ้าตอนนี้ยังเป็น TIMESTAMP — convert (assume Bangkok wall-time)
DO $$
DECLARE
  cur_type TEXT;
BEGIN
  SELECT data_type INTO cur_type FROM information_schema.columns
   WHERE table_name = 'bookings' AND column_name = 'start_time';
  IF cur_type = 'timestamp without time zone' THEN
    ALTER TABLE bookings
      ALTER COLUMN start_time TYPE TIMESTAMPTZ USING start_time AT TIME ZONE 'Asia/Bangkok',
      ALTER COLUMN end_time   TYPE TIMESTAMPTZ USING end_time   AT TIME ZONE 'Asia/Bangkok';
  END IF;
END $$;

-- 3. รวม column timestamp อื่นๆ (independent — alter แยกได้)
CREATE OR REPLACE FUNCTION _kuz_migrate_to_tstz(p_table TEXT, p_col TEXT) RETURNS void AS $$
DECLARE
  cur_type TEXT;
BEGIN
  SELECT data_type INTO cur_type FROM information_schema.columns
   WHERE table_name = p_table AND column_name = p_col;
  IF cur_type = 'timestamp without time zone' THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE TIMESTAMPTZ USING %I AT TIME ZONE ''Asia/Bangkok''',
      p_table, p_col, p_col
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

SELECT _kuz_migrate_to_tstz('bookings', 'created_at');
SELECT _kuz_migrate_to_tstz('users', 'created_at');
SELECT _kuz_migrate_to_tstz('quota', 'updated_at');
SELECT _kuz_migrate_to_tstz('rooms', 'created_at');
SELECT _kuz_migrate_to_tstz('rooms', 'updated_at');
SELECT _kuz_migrate_to_tstz('zoom_accounts', 'created_at');
SELECT _kuz_migrate_to_tstz('zoom_accounts', 'updated_at');
SELECT _kuz_migrate_to_tstz('audit_logs', 'created_at');
SELECT _kuz_migrate_to_tstz('booking_calendar_events', 'created_at');

DROP FUNCTION _kuz_migrate_to_tstz(TEXT, TEXT);

-- 4. recreate time-order constraint
ALTER TABLE bookings
  ADD CONSTRAINT bookings_time_valid CHECK (end_time > start_time);

-- 5. recreate no-overlap constraint
-- ปัญหา: Postgres declare EXTRACT(EPOCH FROM timestamptz) เป็น STABLE
--        ทั้งที่ epoch absolute ไม่ขึ้นกับ TZ — index expression ต้อง IMMUTABLE
-- workaround: ห่อใน function ใหม่ที่ declare IMMUTABLE เอง (ปลอดภัยจริง —
--             epoch ของ instant คงที่ตลอด ไม่ขึ้น session TZ)
CREATE OR REPLACE FUNCTION kuz_epoch(t TIMESTAMPTZ) RETURNS NUMERIC
  AS 'SELECT EXTRACT(EPOCH FROM t)::numeric'
  LANGUAGE SQL IMMUTABLE PARALLEL SAFE;

-- timestamptz + interval ก็เป็น STABLE (DST/month ambiguity) → บวก epoch ตรงๆ
ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    room_id WITH =,
    numrange(
      kuz_epoch(start_time),
      kuz_epoch(end_time) + 60,  -- +60 วินาที = buffer 1 นาที
      '[)'
    ) WITH &&
  ) WHERE (status = 'confirmed');
