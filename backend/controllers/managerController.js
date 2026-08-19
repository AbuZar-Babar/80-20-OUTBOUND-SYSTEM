const { UserStore, LeadStore, ActivityLogStore, CallStore, MessageStore, LoginSessionStore } = require('../config/store');
const { isMongoConnected } = require('../config/db');
const Lead = require('../models/Lead');
const ActivityLog = require('../models/ActivityLog');

const getDashboardMetrics = async (req, res, next) => {
  try {
    if (req.user.role === 'salesperson') {
      const metrics = await LeadStore.getManagerMetrics(req.user._id);
      const stats = await ActivityLogStore.getUserStats(req.user._id);
      return res.status(200).json({ success: true, data: { ...metrics, ...stats } });
    }

    const users = await UserStore.findAllUsers();
    const salespeople = users.filter(u => u.role === 'salesperson');
    const allMetrics = [];
    let totalLeads = 0, totalContacted = 0, totalInterested = 0, totalBooked = 0, totalOverdue = 0;

    for (const sp of salespeople) {
      const metrics = await LeadStore.getManagerMetrics(sp._id);
      const stats = await ActivityLogStore.getUserStats(sp._id);
      const sessionStats = await LoginSessionStore.getUserStats(sp._id);
      allMetrics.push({ user: { _id: sp._id, name: sp.name, email: sp.email }, metrics, stats: { ...stats, ...sessionStats } });
      totalLeads += metrics.total;
      totalContacted += metrics.contacted;
      totalInterested += metrics.interested;
      totalBooked += metrics.booked;
      totalOverdue += metrics.callbacksOverdue;
    }

    res.status(200).json({
      success: true,
      data: {
        overview: { totalLeads, totalContacted, totalInterested, totalBooked, totalOverdue, salespersonCount: salespeople.length },
        salespeople: allMetrics
      }
    });
  } catch (error) {
    next(error);
  }
};

const getTeamActivity = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    let logs;

    if (req.user.role === 'salesperson') {
      logs = await ActivityLogStore.findByUser(req.user._id, limit);
    } else {
      if (isMongoConnected()) {
        logs = await ActivityLog.find().sort({ timestamp: -1 }).limit(limit).populate('userId', 'name').lean();
      } else {
        const users = await UserStore.findAllUsers();
        const allLogs = [];
        for (const u of users) {
          const userLogs = await ActivityLogStore.findByUser(u._id, limit);
          allLogs.push(...userLogs);
        }
        logs = allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);
      }
    }

    res.status(200).json({ success: true, count: logs.length, data: logs });
  } catch (error) {
    next(error);
  }
};

const getAlerts = async (req, res, next) => {
  try {
    const userId = req.user.role === 'salesperson' ? req.user._id : null;
    const alerts = [];

    if (isMongoConnected()) {
      const query = userId ? { userId } : {};
      const overdueCallbacks = await Lead.find({ ...query, status: 'callback', callbackDate: { $lt: new Date() } }).countDocuments();
      const untouched = await Lead.find({ ...query, status: 'new' }).countDocuments();

      if (overdueCallbacks > 0) alerts.push({ type: 'warning', message: `${overdueCallbacks} overdue callbacks`, count: overdueCallbacks });
      if (untouched > 0) alerts.push({ type: 'info', message: `${untouched} untouched leads`, count: untouched });
    }

    res.status(200).json({ success: true, data: alerts });
  } catch (error) {
    next(error);
  }
};

module.exports = { getDashboardMetrics, getTeamActivity, getAlerts };
