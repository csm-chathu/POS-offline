// role('admin') or role('admin', 'manager')
// 'custom' and 'setup' are treated as equivalent to 'manager' for all route checks
const ROLE_ALIASES = { custom: 'manager', setup: 'manager' };

module.exports = function role(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
    const effectiveRole = ROLE_ALIASES[req.user.role] ?? req.user.role;
    if (!allowed.includes(effectiveRole)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
};
