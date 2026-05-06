// ใช้ต่อจาก authenticate — req.user.role ถูก set แล้วและมาจาก DB เสมอ
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'ต้องเป็นแอดมินเท่านั้น' });
  }
  next();
}

module.exports = requireAdmin;
