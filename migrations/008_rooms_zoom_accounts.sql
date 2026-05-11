-- บังคับ client encoding เป็น UTF8 — แก้ปัญหา psql Windows cp874
SET client_encoding = 'UTF8';

-- btree_gist รองรับ uuid ใน GIST exclusion constraint (ตั้งแต่ btree_gist 1.7)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. เพิ่ม role 'licensed' — รองรับทั้ง 2 case (ENUM type หรือ VARCHAR+CHECK)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    -- ENUM type — เพิ่ม value ใหม่
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'user_role' AND e.enumlabel = 'licensed'
    ) THEN
      EXECUTE 'ALTER TYPE user_role ADD VALUE ''licensed''';
    END IF;
  ELSE
    -- VARCHAR + CHECK — drop + recreate
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('student', 'admin', 'licensed'));
  END IF;
END $$;

-- 2. zoom_accounts
CREATE TABLE IF NOT EXISTS zoom_accounts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label         VARCHAR(100) NOT NULL UNIQUE,
  account_id    VARCHAR(255) NOT NULL,
  client_id     VARCHAR(255) NOT NULL,
  client_secret TEXT NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. rooms (zoom_account_id NULL = ใช้ ENV default)
CREATE TABLE IF NOT EXISTS rooms (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             VARCHAR(100) NOT NULL UNIQUE,
  capacity         INTEGER NOT NULL DEFAULT 100 CHECK (capacity > 0 AND capacity <= 10000),
  zoom_account_id  UUID REFERENCES zoom_accounts(id) ON DELETE SET NULL,
  is_licensed_only BOOLEAN NOT NULL DEFAULT false,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 4. room_id ใน bookings
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES rooms(id) ON DELETE SET NULL;

-- 5. seed ห้อง default (ใช้ ASCII name เพื่อเลี่ยงปัญหา encoding ตอน insert)
-- (ภาษาไทยจะถูกตั้งผ่าน UPDATE ทีหลังด้วย E'\u...' หรือผ่าน UI admin)
INSERT INTO rooms (name, capacity, is_licensed_only)
  VALUES ('Default Free Room', 100, false)
  ON CONFLICT (name) DO NOTHING;

-- 6. backfill room_id ของ booking เก่า → ห้อง default
UPDATE bookings
   SET room_id = (SELECT id FROM rooms WHERE name = 'Default Free Room')
 WHERE room_id IS NULL;

-- 7. เปลี่ยน no-overlap constraint ให้ scope per room
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    room_id WITH =,
    tsrange(start_time, end_time + interval '1 minute', '[)') WITH &&
  ) WHERE (status = 'confirmed');

-- 8. index
CREATE INDEX IF NOT EXISTS idx_bookings_room_start
  ON bookings(room_id, start_time);
CREATE INDEX IF NOT EXISTS idx_rooms_active
  ON rooms(is_active) WHERE is_active = true;
