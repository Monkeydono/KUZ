-- DROP CHECK constraint chk_max_advance
--
-- เหตุผล: constraint นี้บังคับว่า booking ต้องไม่ล่วงหน้าเกิน X วัน
-- แต่ CHECK constraint ใน SQL reference table อื่นไม่ได้ จึงไม่สามารถยกเว้น
-- admin/licensed ออกจาก rule ได้
--
-- การเช็คย้ายไป application layer ที่ bookingService.js:80-84 (สำหรับ single)
-- และ bookingService.js:197-201 (สำหรับ recurring) — ที่นั่นรู้ role จึง bypass
-- admin/licensed ได้ถูกต้อง
--
-- bug ที่ทำให้ต้อง drop:
--   จอง weekly 4 ครั้ง → occurrence ที่ 3-4 ตกใน 21 วันข้างหน้า → ผ่าน app check
--   แต่ DB constraint อาจเข้มกว่า (เช่น 14 วัน) → reject ทั้ง transaction

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS chk_max_advance;
