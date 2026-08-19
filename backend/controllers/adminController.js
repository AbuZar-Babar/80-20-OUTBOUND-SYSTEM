const { UserStore } = require('../config/store');

const getPendingUsers = async (req, res, next) => {
  try {
    if (!['admin', 'owner', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Admin access required.' });
    }
    const users = await UserStore.findPendingUsers();
    res.status(200).json({ success: true, count: users.length, data: users });
  } catch (error) {
    next(error);
  }
};

const getAllUsers = async (req, res, next) => {
  try {
    if (!['admin', 'owner', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Admin access required.' });
    }
    const users = await UserStore.findAllUsers();
    res.status(200).json({ success: true, count: users.length, data: users });
  } catch (error) {
    next(error);
  }
};

const approveUser = async (req, res, next) => {
  try {
    if (!['admin', 'owner', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Admin access required.' });
    }
    const user = await UserStore.approveUser(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.status(200).json({ success: true, message: 'User approved.', data: user });
  } catch (error) {
    next(error);
  }
};

const rejectUser = async (req, res, next) => {
  try {
    if (!['admin', 'owner', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Admin access required.' });
    }
    const deleted = await UserStore.rejectUser(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'User not found.' });
    res.status(200).json({ success: true, message: 'User rejected and removed.' });
  } catch (error) {
    next(error);
  }
};

const updateUserRole = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Owner/Admin access required.' });
    }
    const { role } = req.body;
    if (!['owner', 'manager', 'salesperson'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role.' });
    }
    const user = await UserStore.updateRole(req.params.id, role);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.status(200).json({ success: true, message: `Role updated to ${role}.`, data: user });
  } catch (error) {
    next(error);
  }
};

module.exports = { getPendingUsers, getAllUsers, approveUser, rejectUser, updateUserRole };
