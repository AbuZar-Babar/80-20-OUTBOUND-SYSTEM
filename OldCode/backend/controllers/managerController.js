const { UserStore, LeadStore, ActivityLogStore, CallStore, MessageStore, LoginSessionStore, SendingInboxStore } = require('../config/store');
const { isMongoConnected } = require('../config/db');
const Lead = require('../models/Lead');
const ActivityLog = require('../models/ActivityLog');
const Message = require('../models/Message');

const getDashboardMetrics = async (req, res, next) => {
  try {
    // Allow manager, salesperson, or admin
    if (['salesperson', 'manager', 'admin'].includes(req.user.role)) {
      const metrics = await LeadStore.getManagerMetrics(req.user._id);
      const stats = await ActivityLogStore.getUserStats(req.user._id);
      const sessionStats = await LoginSessionStore.getUserStats(req.user._id);
      const activeHours = (sessionStats.activeTimeSeconds || 0) / 3600;
      const callsPerHour = activeHours > 0 ? (stats.callsToday / activeHours).toFixed(1) : (stats.callsToday || 0);
      const bookingRate = metrics.contacted > 0 ? ((metrics.booked / metrics.contacted) * 100).toFixed(1) + '%' : '0%';

      return res.status(200).json({
        success: true,
        data: {
          ...metrics,
          ...stats,
          ...sessionStats,
          callsPerHour,
          bookingRate
        }
      });
    }

    // For other roles, return empty metrics
    return res.status(200).json({
      success: true,
      data: {
        callsPerHour: 0,
        bookingRate: '0%',
        callsToday: 0,
        contacted: 0,
        interested: 0,
        booked: 0,
        missedCalls: 0,
        conversionRate: '0%',
        activeTimeSeconds: 0,
        totalLeads: 0
      }
    });
  } catch (error) {
    next(error);
  }
};

const getTeamActivity = async (req, res, next) => {
  try {
    // Allow manager, salesperson, or admin
    const userId = ['salesperson', 'manager', 'admin'].includes(req.user.role) ? req.user._id : null;

    const limit = parseInt(req.query.limit) || 50;
    let logs;

    if (userId) {
      logs = await ActivityLogStore.findByUser(userId, limit);
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

      if (overdueCallbacks > 0) alerts.push({ type: 'warning', category: 'overdue-callbacks', message: `${overdueCallbacks} overdue callback(s)`, count: overdueCallbacks });
      if (untouched > 0) alerts.push({ type: 'info', category: 'untouched-leads', message: `${untouched} untouched lead(s)`, count: untouched });

      const failedMessages = await Message.find({ ...query, channel: 'whatsapp', status: { $in: ['failed', 'undelivered'] } }).countDocuments();
      if (failedMessages > 0) alerts.push({ type: 'error', category: 'failed-whatsapp', message: `${failedMessages} failed/undelivered WhatsApp message(s)`, count: failedMessages });

      const failedSms = await Message.find({ ...query, channel: 'sms', status: { $in: ['failed', 'undelivered'] } }).countDocuments();
      if (failedSms > 0) alerts.push({ type: 'error', category: 'failed-sms', message: `${failedSms} failed/undelivered SMS`, count: failedSms });

      const unansweredWaReplies = await Lead.find({ ...query, hasUnansweredReply: true, lastReplyChannel: 'whatsapp' }).countDocuments();
      if (unansweredWaReplies > 0) alerts.push({ type: 'warning', category: 'unanswered-whatsapp', message: `${unansweredWaReplies} unanswered WhatsApp reply(ies) needing action`, count: unansweredWaReplies });

      const unansweredSmsReplies = await Lead.find({ ...query, hasUnansweredReply: true, lastReplyChannel: 'sms' }).countDocuments();
      if (unansweredSmsReplies > 0) alerts.push({ type: 'warning', category: 'inbound-sms-followup', message: `${unansweredSmsReplies} unanswered SMS reply(ies) needing action`, count: unansweredSmsReplies });

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
    } else {
      // Store fallback alerts
      const queue = await LeadStore.findDailyQueue(userId || req.user._id);
      if (queue.overdue?.length > 0) {
        alerts.push({ type: 'warning', category: 'overdue-callbacks', message: `${queue.overdue.length} overdue callback(s)`, count: queue.overdue.length });
      }
      const waReplies = (queue.replies || []).filter(r => r.lastReplyChannel === 'whatsapp');
      if (waReplies.length > 0) {
        alerts.push({ type: 'warning', category: 'unanswered-whatsapp', message: `${waReplies.length} unanswered WhatsApp reply(ies)`, count: waReplies.length });
      }
    }

    res.status(200).json({ success: true, data: alerts });
  } catch (error) {
    next(error);
  }
};

module.exports = { getDashboardMetrics, getTeamActivity, getAlerts };
