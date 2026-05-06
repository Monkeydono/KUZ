-- เก็บรายการอีเมล co-host ของแต่ละ booking
-- ใช้ array ของ Postgres ดีกว่า join table เพราะ co-host มีไม่กี่คน
-- และไม่ต้อง index/query ค้นหาแยก

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS co_host_emails TEXT[] NOT NULL DEFAULT '{}';
