SET client_encoding = 'UTF8';

-- Seed ห้อง preset 3 ขนาด (100 / 300 / 1000 คน)
-- ห้อง 100 = ใช้ ENV Zoom (Free plan) → พร้อมใช้งานทันที
-- ห้อง 300, 1000 = ต้องผูก Zoom Pro account ก่อน — admin ใส่ผ่านหน้า /admin → ห้อง

-- rename ห้องเดิม (จาก migration 008) ให้ชัดเจน
UPDATE rooms SET name = 'Room 100 (Free)'
  WHERE name = 'Default Free Room';

INSERT INTO rooms (name, capacity, is_priority_only) VALUES
  ('Room 300 (Pro)',  300,  false),
  ('Room 1000 (Pro)', 1000, false)
ON CONFLICT (name) DO NOTHING;
