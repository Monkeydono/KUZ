const { Pool } = require('pg');
require('dotenv').config();

// note: ทุก timestamp column ใน bookings/users/quota/audit_logs/... เป็น TIMESTAMPTZ
// (migration 011) pg-node default parser จัดการ UTC instant ถูกต้องเอง
// ไม่ต้องตั้ง session TZ หรือ custom type parser
const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('Database connection failed:', err.message);
  } else {
    console.log('Database connected successfully');
    release();
  }
});

module.exports = pool;
