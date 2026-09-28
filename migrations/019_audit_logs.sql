SET client_encoding = 'UTF8';

-- ตาราง audit_logs ถูกใช้ใน auditService และหน้า /admin แท็บ Audit
-- แต่ไม่เคยมี migration สร้างไว้ — บน production น่าจะสร้างด้วยมือ
-- ติดตั้งใหม่จาก migrations อย่างเดียวจะไม่มีตารางนี้ → audit ทุกรายการ fail เงียบ ๆ
-- IF NOT EXISTS → รันบน production ที่มีตารางอยู่แล้วได้โดยไม่กระทบของเดิม
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  booking_id  UUID REFERENCES bookings(id) ON DELETE SET NULL,
  action      VARCHAR(100) NOT NULL,
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action     ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id    ON audit_logs(user_id);
