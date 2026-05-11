SET client_encoding = 'UTF8';

-- Zoom Pro readiness: infrastructure ป้องกันปัญหาเมื่อเริ่มใช้ Zoom Pro API
--
-- เพิ่ม:
-- 1. zoom_accounts.max_attendees — license limit ของแต่ละ account
-- 2. bookings.zoom_account_id — denormalized จาก rooms (สำหรับ exclusion constraint)
-- 3. exclusion ใหม่: ห้อง 2 ห้องที่ share Zoom account จองชนเวลาไม่ได้
-- 4. status 'pending_approval' + approved_by/approved_at — approval workflow

-- 1. max_attendees ของ Zoom account
ALTER TABLE zoom_accounts
  ADD COLUMN IF NOT EXISTS max_attendees INTEGER NOT NULL DEFAULT 100
    CHECK (max_attendees > 0 AND max_attendees <= 10000);

-- 2. denormalized zoom_account_id ใน bookings + sync trigger
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS zoom_account_id UUID REFERENCES zoom_accounts(id) ON DELETE SET NULL;

-- backfill ของเก่า
UPDATE bookings b
   SET zoom_account_id = r.zoom_account_id
  FROM rooms r
 WHERE b.room_id = r.id AND b.zoom_account_id IS NULL;

CREATE OR REPLACE FUNCTION sync_booking_zoom_account() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.room_id IS NOT NULL THEN
    SELECT zoom_account_id INTO NEW.zoom_account_id
      FROM rooms WHERE id = NEW.room_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_booking_zoom_account_trigger ON bookings;
CREATE TRIGGER sync_booking_zoom_account_trigger
  BEFORE INSERT OR UPDATE OF room_id ON bookings
  FOR EACH ROW EXECUTE FUNCTION sync_booking_zoom_account();

-- 3. exclusion ระดับ zoom_account (กัน 2 ห้องที่ share host ชนกัน)
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap_zoom_account;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlap_zoom_account
  EXCLUDE USING gist (
    zoom_account_id WITH =,
    numrange(
      kuz_epoch(start_time),
      kuz_epoch(end_time) + 60,
      '[)'
    ) WITH &&
  ) WHERE (status = 'confirmed' AND zoom_account_id IS NOT NULL);

-- 4. approval workflow: status 'pending_approval' + approver tracking
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_status') THEN
    -- ENUM type
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'booking_status' AND e.enumlabel = 'pending_approval'
    ) THEN
      EXECUTE 'ALTER TYPE booking_status ADD VALUE ''pending_approval''';
    END IF;
  ELSE
    -- VARCHAR + CHECK (fallback)
    ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_status_check
      CHECK (status IN ('confirmed', 'cancelled', 'completed', 'pending_approval'));
  END IF;
END $$;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT;

-- 5. zoom_meeting_id, zoom_join_url, zoom_password อาจ NULL สำหรับ pending_approval
-- (จะถูกสร้างตอน approve)
-- columns เหล่านี้ nullable อยู่แล้ว — no change

CREATE INDEX IF NOT EXISTS idx_bookings_pending
  ON bookings(created_at DESC)
  WHERE status = 'pending_approval';
