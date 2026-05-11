SET client_encoding = 'UTF8';

-- rename role 'licensed' → 'priority'
-- ความหมาย: priority = สิทธิ์พิเศษจองห้อง premium ที่ admin กำหนด
-- (admin > priority > student)

-- 1. rename enum value หรือ update CHECK constraint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    -- ENUM type
    IF EXISTS (
      SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'user_role' AND e.enumlabel = 'licensed'
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'user_role' AND e.enumlabel = 'priority'
    ) THEN
      ALTER TYPE user_role RENAME VALUE 'licensed' TO 'priority';
    ELSIF NOT EXISTS (
      SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'user_role' AND e.enumlabel = 'priority'
    ) THEN
      EXECUTE 'ALTER TYPE user_role ADD VALUE ''priority''';
    END IF;
  ELSE
    -- VARCHAR + CHECK
    UPDATE users SET role = 'priority' WHERE role = 'licensed';
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('student', 'admin', 'priority'));
  END IF;
END $$;

-- 2. rename column is_licensed_only → is_priority_only
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'rooms' AND column_name = 'is_licensed_only'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'rooms' AND column_name = 'is_priority_only'
  ) THEN
    ALTER TABLE rooms RENAME COLUMN is_licensed_only TO is_priority_only;
  END IF;
END $$;
