SET client_encoding = 'UTF8';

-- เก็บ type-person จาก KU ALL-Login userinfo
-- 1=teacher, 2=staff, 3=student, 4=alumni, 5=guest, 7=นิสิตศาสตร์แห่งแผ่นดิน, 8=nondegree
-- 101/111=อาจารย์สาธิต, 102/112=บุคลากรสาธิต, 103/113=นักเรียนสาธิต
-- ใช้สำหรับ quota แยกกลุ่มในอนาคต (นิสิต/อาจารย์/นร.สาธิต/alumni)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ku_type_person TEXT;
