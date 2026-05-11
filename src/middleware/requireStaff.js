// allow: role 'admin' หรือ 'staff'
// staff = moderator (ดู bookings, ยกเลิกของผู้อื่น, ดู audit) แต่ไม่จัดการ schema/users
function requireStaff(req, res, next) {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'staff') {
    return res.status(403).json({ error: 'ต้องเป็นแอดมินหรือ staff เท่านั้น' });
  }
  next();
}

module.exports = requireStaff;
