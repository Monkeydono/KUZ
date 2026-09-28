SET client_encoding = 'UTF8';

-- โปรไฟล์จาก KU ALL-Login สำหรับทำสถิติ (feedback Rev.1 ข้อ 1)
-- ชื่อ attribute ตามคู่มือ OCS SSO_Programer_Manual v2.1 หน้า 14-15
--   บุคลากร: faculty, ku-faculty-code, department, ku-department-code
--   นิสิต:   major-id (รหัสคณะ) — ไม่มีชื่อคณะ/ภาควิชาให้
-- ku_profile_at = เวลาที่ยืนยันตัวตนผ่าน KU ALL-Login ล่าสุด
--   NULL = ยังไม่เคย → ต้องล็อกอิน KU ALL-Login 1 ครั้งก่อนใช้งาน
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ku_faculty          TEXT,
  ADD COLUMN IF NOT EXISTS ku_faculty_code     TEXT,
  ADD COLUMN IF NOT EXISTS ku_department       TEXT,
  ADD COLUMN IF NOT EXISTS ku_department_code  TEXT,
  ADD COLUMN IF NOT EXISTS ku_major_id         TEXT,
  ADD COLUMN IF NOT EXISTS ku_campus           TEXT,
  ADD COLUMN IF NOT EXISTS ku_profile_at       TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_ku_type_person ON users(ku_type_person);
