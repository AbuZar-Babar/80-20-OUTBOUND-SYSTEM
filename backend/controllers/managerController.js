const { UserStore, LeadStore, ActivityLogStore, CallStore, MessageStore, LoginSessionStore, SendingInboxStore } = require('../config/store');
const { isMongoConnected } = require('../config/db');
const Lead = require('../models/Lead');
const ActivityLog = require('../models/ActivityLog');
const Message = require('../models/Message');

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

      if (overdueCallbacks > 0) alerts.push({ type: 'warning', category: 'overdue-callbacks', message: `${overdueCallbacks} overdue callbacks`, count: overdueCallbacks });
      if (untouched > 0) alerts.push({ type: 'info', category: 'untouched-leads', message: `${untouched} untouched leads`, count: untouched });

      const failedSms = await Message.find({ ...query, status: { $in: ['failed', 'undelivered'] } }).countDocuments();
      if (failedSms > 0) alerts.push({ type: 'error', category: 'failed-sms', message: `${failedSms} failed/undelivered SMS`, count: failedSms });

      const unansweredReplies = await ActivityLog.find({ ...query, action: 'inbound-reply', timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }).countDocuments();
      if (unansweredReplies > 0) alerts.push({ type: 'warning', category: 'unanswered-replies', message: `${unansweredReplies} unanswered replies (24h)`, count: unansweredReplies });

      const inboundSmsReplies = await ActivityLog.find({ ...query, action: 'sms', outcome: 'inbound-reply', timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }).countDocuments();
      if (inboundSmsReplies > 0) alerts.push({ type: 'warning', category: 'inbound-sms-followup', message: `${inboundSmsReplies} inbound SMS needing follow-up (24h)`, count: inboundSmsReplies });

      if (!userId) {
        const users = await UserStore.findAllUsers();
        const salespeople = users.filter(u => u.role === 'salesperson');
        for (const sp of salespeople) {
          const inbox = await SendingInboxStore.getToday(sp._id);
          if (inbox.status === 'throttled') {
            alerts.push({ type: 'error', category: 'unhealthy-inbox', message: `${sp.name} inbox throttled (limit hit)`, count: 1, userId: sp._id });
          }
          const metrics = await LeadStore.getManagerMetrics(sp._id);
          const user = await UserStore.findById(sp._id);
          const target = user?.dailyLeadTarget || 50;
          if (metrics.contacted < target * 0.5 && new Date().getHours() >= 14) {
            alerts.push({ type: 'warning', category: 'missed-target', message: `${sp.name} below 50% of daily target`, count: 1, userId: sp._id });
          }
        }
      } else {
        const inbox = await SendingInboxStore.getToday(userId);
        if (inbox.status === 'throttled') {
          alerts.push({ type: 'error', category: 'unhealthy-inbox', message: 'Your inbox is throttled (limit hit)', count: 1 });
        }
        const metrics = await LeadStore.getManagerMetrics(userId);
        const user = await UserStore.findById(userId);
        const target = user?.dailyLeadTarget || 50;
        if (metrics.contacted < target * 0.5 && new Date().getHours() >= 14) {
          alerts.push({ type: 'warning', category: 'missed-target', message: 'Below 50% of daily target', count: 1 });
        }
      }
    }

    res.status(200).json({ success: true, data: alerts });
  } catch (error) {
    next(error);
  }
};

module.exports = { getDashboardMetrics, getTeamActivity, getAlerts };
