// strict: เฉพาะ role 'admin' เท่านั้น
// ใช้กับ action ที่กระทบ schema/ผู้ใช้ (role change, rooms, zoom_accounts, CSV export)
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'ต้องเป็นแอดมินเท่านั้น' });
  }
  next();
}

module.exports = requireAdmin;
