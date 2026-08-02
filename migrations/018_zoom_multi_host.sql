SET client_encoding = 'UTF8';

-- รองรับหลาย licensed user ภายใน Zoom account เดียว
--
-- ปัญหาเดิม: zoomService สร้าง meeting ที่ /users/me/meetings เสมอ = ทุกห้องยิงเข้า
-- owner ของ S2S app คนเดียว และ constraint bookings_no_overlap_zoom_account
-- ก็บล็อกไม่ให้ 2 booking ที่ใช้ zoom_account row เดียวกันเวลาชนกัน
-- → ต่อให้ซื้อ 5 license ก็จองพร้อมกันได้แค่ 1 ห้อง
--
-- วิธีแก้: 1 licensed user = 1 row ใน zoom_accounts (account_id/client_id/client_secret
-- ชุดเดียวกันได้ ต่างกันแค่ zoom_user_id) → 5 license = 5 rows = 5 ห้องพร้อมกัน
-- โดย exclusion constraint ยังกันแต่ละ host จองซ้อนตัวเองอยู่เหมือนเดิม

-- Zoom userId หรือ email ของ licensed user ที่จะเป็น host ของ meeting
-- NULL = ใช้ /users/me (owner ของ S2S app) — พฤติกรรมเดิม ไม่ต้องแก้ row เก่า
ALTER TABLE zoom_accounts
  ADD COLUMN IF NOT EXISTS zoom_user_id VARCHAR(255);

COMMENT ON COLUMN zoom_accounts.zoom_user_id IS
  'Zoom userId หรือ email ของ licensed user ที่ host meeting — NULL = /users/me';

-- กันสร้าง 2 rows ที่ชี้ host คนเดียวกันใน account เดียวกัน
-- ถ้าซ้ำ exclusion constraint จะไม่ทำงาน → 2 ห้องจองทับ host คนเดียวกันได้
-- (เก็บ zoom_user_id เป็น lowercase เสมอจากฝั่ง app เพื่อให้ index นี้ดักได้จริง)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_zoom_accounts_account_user
  ON zoom_accounts(account_id, zoom_user_id)
  WHERE zoom_user_id IS NOT NULL;
