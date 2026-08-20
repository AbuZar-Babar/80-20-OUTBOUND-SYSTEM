const { LoginSessionStore, UserStore } = require('../config/store');

const recordLogin = async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    let session = await LoginSessionStore.findToday(req.user._id);
    if (!session) {
      session = await LoginSessionStore.create({ userId: req.user._id, date: today });
    }
    await UserStore.updateLastLogin(req.user._id);
    res.status(200).json({ success: true, data: session });
  } catch (err) { next(err); }
};

const heartbeat = async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    let session = await LoginSessionStore.findToday(req.user._id);
    if (!session) {
      session = await LoginSessionStore.create({ userId: req.user._id, date: today });
    }
    const now = new Date();
    const lastActivity = new Date(session.lastActivityAt || session.loginAt);
    const elapsed = Math.floor((now - lastActivity) / 1000);

    // If currently on break, do not add to active work time
    const activeAddition = session.isOnBreak ? 0 : elapsed;

    await LoginSessionStore.updateSession(session._id, {
      lastActivityAt: now,
      activeTimeSeconds: (session.activeTimeSeconds || 0) + activeAddition
    });

    // Update user's lastActive timestamp
    await UserStore.updateLastActive(req.user._id);

    res.status(200).json({ success: true, isOnBreak: !!session.isOnBreak });
  } catch (err) { next(err); }
};

const toggleBreak = async (req, res, next) => {
  try {
    const session = await LoginSessionStore.toggleBreak(req.user._id);
    res.status(200).json({
      success: true,
      message: session.isOnBreak ? 'Break started.' : 'Break ended.',
      data: {
        isOnBreak: session.isOnBreak,
        breakTimeSeconds: session.breakTimeSeconds
      }
    });
  } catch (err) { next(err); }
};

const updateDialingTime = async (req, res, next) => {
  try {
    const { seconds } = req.body;
    if (!seconds) return res.status(400).json({ success: false, message: 'seconds required.' });
    const today = new Date().toISOString().slice(0, 10);
    let session = await LoginSessionStore.findToday(req.user._id);
    if (!session) {
      session = await LoginSessionStore.create({ userId: req.user._id, date: today });
    }
    await LoginSessionStore.updateSession(session._id, {
      dialingTimeSeconds: (session.dialingTimeSeconds || 0) + seconds
    });
    res.status(200).json({ success: true });
  } catch (err) { next(err); }
};

const getUserSessionStats = async (req, res, next) => {
  try {
    const userId = req.params.userId || req.user._id;
    const stats = await LoginSessionStore.getUserStats(userId);
    res.status(200).json({ success: true, data: stats });
  } catch (err) { next(err); }
};

const getOnlineUsers = async (req, res, next) => {
  try {
    const onlineUsers = await UserStore.findOnlineUsers();
    res.status(200).json({ success: true, count: onlineUsers.length, data: onlineUsers });
  } catch (err) { next(err); }
};

module.exports = { recordLogin, heartbeat, toggleBreak, updateDialingTime, getUserSessionStats, getOnlineUsers };

