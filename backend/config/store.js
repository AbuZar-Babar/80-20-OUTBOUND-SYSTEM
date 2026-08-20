const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { isMongoConnected } = require('./db');

// Mongoose models (used when MongoDB is connected)
const User = require('../models/User');
const Call = require('../models/Call');
const Message = require('../models/Message');
const Contact = require('../models/Contact');
const Lead = require('../models/Lead');
const Campaign = require('../models/Campaign');
const ActivityLog = require('../models/ActivityLog');
const EmailTemplate = require('../models/EmailTemplate');
const LoginSession = require('../models/LoginSession');
const SendingInbox = require('../models/SendingInbox');
const EmailSequence = require('../models/EmailSequence');
const WhatsAppTemplate = require('../models/WhatsAppTemplate');

// Zero-DB local persistence
const DATA_DIR = path.join(__dirname, '../../data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

let store = { users: [], calls: [], messages: [], contacts: [] };

if (!isMongoConnected()) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (e) {}
}

const loadStore = () => {
  try {
    if (fs.existsSync && fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf8');
      store = JSON.parse(raw);
      if (!store.users) store.users = [];
      if (!store.calls) store.calls = [];
      if (!store.messages) store.messages = [];
      if (!store.contacts) store.contacts = [];
      console.log(`[Zero-DB] Loaded: ${store.users.length} users, ${store.contacts.length} contacts`);
    } else {
      saveStore();
    }
  } catch (err) {
    // Vercel serverless - skip file load
  }
};

const saveStore = () => {
  if (isMongoConnected()) return;
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    // Vercel serverless has no writable disk - ignore save errors
  }
};

const generateId = () => Math.random().toString(36).substring(2, 11) + Date.now().toString(36);

// --- User Operations ---
const UserStore = {
  async findOne({ email }) {
    if (isMongoConnected()) {
      return await User.findOne({ email: email.toLowerCase() }).lean();
    }
    if (!email) return null;
    const user = store.users.find(u => u.email === email.toLowerCase());
    return user ? { ...user } : null;
  },

  async findById(id) {
    if (isMongoConnected()) {
      const user = await User.findById(id).lean();
      if (!user) return null;
      const { password, ...rest } = user;
      return rest;
    }
    const user = store.users.find(u => u._id === id);
    if (!user) return null;
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  },

  async create({ name, email, password, role, approved }) {
    const now = new Date();
    if (isMongoConnected()) {
      const user = await User.create({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password,
        role: role || 'salesperson',
        approved: approved !== undefined ? approved : false,
        lastActive: now,
        lastLogin: now,
        createdAt: now
      });
      const { password: _, ...rest } = user.toObject();
      return rest;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const newUser = {
      _id: generateId(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: role || 'salesperson',
      approved: approved !== undefined ? approved : false,
      lastActive: now.toISOString(),
      lastLogin: now.toISOString(),
      createdAt: now.toISOString()
    };
    store.users.push(newUser);
    saveStore();
    const { password: _, ...userWithoutPassword } = newUser;
    return userWithoutPassword;
  },

  async matchPassword(enteredPassword, hashedPassword) {
    return await bcrypt.compare(enteredPassword, hashedPassword);
  },

  async updateProfile(id, updateData) {
    if (isMongoConnected()) {
      return await User.findByIdAndUpdate(id, updateData, { new: true }).select('-password').lean();
    }
    const idx = store.users.findIndex(u => u._id === id);
    if (idx === -1) return null;
    store.users[idx] = { ...store.users[idx], ...updateData };
    saveStore();
    const { password: _, ...rest } = store.users[idx];
    return rest;
  },

  async updateLastActive(id) {
    const now = new Date();
    if (isMongoConnected()) {
      return await User.findByIdAndUpdate(id, { lastActive: now }, { new: true }).select('-password').lean();
    }
    const idx = store.users.findIndex(u => u._id === id);
    if (idx === -1) return null;
    store.users[idx].lastActive = now.toISOString();
    saveStore();
    const { password: _, ...rest } = store.users[idx];
    return rest;
  },

  async updateLastLogin(id) {
    const now = new Date();
    if (isMongoConnected()) {
      return await User.findByIdAndUpdate(id, { lastLogin: now, lastActive: now }, { new: true }).select('-password').lean();
    }
    const idx = store.users.findIndex(u => u._id === id);
    if (idx === -1) return null;
    store.users[idx].lastLogin = now.toISOString();
    store.users[idx].lastActive = now.toISOString();
    saveStore();
    const { password: _, ...rest } = store.users[idx];
    return rest;
  },

  async findPendingUsers() {
    if (isMongoConnected()) {
      return await User.find({ approved: false }).sort({ createdAt: -1 }).select('-password').lean();
    }
    return (store.users || [])
      .filter(u => u.approved === false)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .map(({ password, ...rest }) => rest);
  },

  async findAllUsers() {
    if (isMongoConnected()) {
      return await User.find().sort({ createdAt: -1 }).select('-password').lean();
    }
    return (store.users || [])
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .map(({ password, ...rest }) => rest);
  },

  async findOnlineUsers() {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (isMongoConnected()) {
      return await User.find({ lastActive: { $gte: fiveMinutesAgo }, approved: true })
        .sort({ lastActive: -1 })
        .select('-password')
        .lean();
    }
    return (store.users || [])
      .filter(u => u.approved && u.lastActive && new Date(u.lastActive) >= fiveMinutesAgo)
      .sort((a, b) => new Date(b.lastActive || 0) - new Date(a.lastActive || 0))
      .map(({ password, ...rest }) => rest);
  },

  async approveUser(id) {
    if (isMongoConnected()) {
      return await User.findByIdAndUpdate(id, { approved: true }, { new: true }).select('-password').lean();
    }
    const user = store.users.find(u => u._id === id);
    if (!user) return null;
    user.approved = true;
    saveStore();
    const { password, ...rest } = user;
    return rest;
  },

  async rejectUser(id) {
    if (isMongoConnected()) {
      await User.findByIdAndDelete(id);
      return true;
    }
    const initialLength = store.users.length;
    store.users = store.users.filter(u => u._id !== id);
    const deleted = store.users.length < initialLength;
    if (deleted) saveStore();
    return deleted;
  },

  async updateRole(id, role) {
    if (isMongoConnected()) {
      return await User.findByIdAndUpdate(id, { role }, { new: true }).select('-password').lean();
    }
    const user = store.users.find(u => u._id === id);
    if (!user) return null;
    user.role = role;
    saveStore();
    const { password, ...rest } = user;
    return rest;
  }
};

// --- Call Operations ---
const CallStore = {
  async create({ userId, callSid, from, to, status, startTime }) {
    if (isMongoConnected()) {
      return await Call.create({ userId, callSid, from, to, status: status || 'queued', startTime });
    }

    const newCall = {
      _id: generateId(),
      userId: userId.toString(),
      callSid,
      from,
      to,
      status: status || 'queued',
      duration: 0,
      startTime: startTime ? new Date(startTime).toISOString() : new Date().toISOString(),
      endTime: null,
      recordingUrl: null,
      recordingSid: null,
      recordingDuration: 0,
      createdAt: new Date().toISOString()
    };
    store.calls.unshift(newCall);
    saveStore();
    return newCall;
  },

  async findByUserId(userId) {
    if (isMongoConnected()) {
      return await Call.find({ userId }).sort({ createdAt: -1 }).lean();
    }
    return store.calls
      .filter(c => c.userId === userId.toString())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async findOneAndUpdate({ callSid }, updateData) {
    if (isMongoConnected()) {
      return await Call.findOneAndUpdate({ callSid }, updateData, { new: true }).lean();
    }

    const callIndex = store.calls.findIndex(c => c.callSid === callSid);
    if (callIndex === -1) return null;
    store.calls[callIndex] = {
      ...store.calls[callIndex],
      ...updateData,
      ...(updateData.endTime ? { endTime: new Date(updateData.endTime).toISOString() } : {})
    };
    saveStore();
    return store.calls[callIndex];
  }
};

// --- Message Operations ---
const MessageStore = {
  async create({ userId, messageSid, from, to, body, status }) {
    if (isMongoConnected()) {
      return await Message.create({ userId, messageSid, from, to, body, status: status || 'queued' });
    }

    const newMessage = {
      _id: generateId(),
      userId: userId.toString(),
      messageSid,
      from,
      to,
      body,
      status: status || 'queued',
      createdAt: new Date().toISOString()
    };
    store.messages.unshift(newMessage);
    saveStore();
    return newMessage;
  },

  async findByUserId(userId) {
    if (isMongoConnected()) {
      return await Message.find({ userId }).sort({ createdAt: -1 }).lean();
    }
    return store.messages
      .filter(m => m.userId === userId.toString())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async findOneAndUpdate(query, updateData) {
    if (isMongoConnected()) {
      return await Message.findOneAndUpdate(query, updateData, { new: true }).lean();
    }
    const idx = store.messages.findIndex(m => {
      if (query.messageSid && m.messageSid !== query.messageSid) return false;
      if (query.to && m.to !== query.to) return false;
      return true;
    });
    if (idx === -1) return null;
    store.messages[idx] = { ...store.messages[idx], ...updateData };
    saveStore();
    return store.messages[idx];
  },

  async findLastByToPhone(toPhone) {
    if (isMongoConnected()) {
      return await Message.findOne({ to: toPhone, direction: 'outbound' }).sort({ createdAt: -1 }).lean();
    }
    return store.messages
      .filter(m => m.to === toPhone && m.direction === 'outbound')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
  }
};

// --- Contact Operations ---
const ContactStore = {
  async create({ userId, name, phone }) {
    if (isMongoConnected()) {
      return await Contact.create({ userId, name: name.trim(), phone: phone.trim() });
    }

    const newContact = {
      _id: generateId(),
      userId: userId.toString(),
      name: name.trim(),
      phone: phone.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.contacts.push(newContact);
    saveStore();
    return newContact;
  },

  async findByUserId(userId) {
    if (isMongoConnected()) {
      return await Contact.find({ userId }).sort({ name: 1 }).lean();
    }
    return store.contacts
      .filter(c => c.userId === userId.toString())
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async findOne({ _id, userId }) {
    if (isMongoConnected()) {
      return await Contact.findOne({ _id, userId }).lean();
    }
    return store.contacts.find(c => c._id === _id && c.userId === userId.toString()) || null;
  },

  async update(_id, userId, { name, phone }) {
    if (isMongoConnected()) {
      const update = {};
      if (name) update.name = name.trim();
      if (phone) update.phone = phone.trim();
      return await Contact.findOneAndUpdate({ _id, userId }, update, { new: true }).lean();
    }

    const contactIndex = store.contacts.findIndex(c => c._id === _id && c.userId === userId.toString());
    if (contactIndex === -1) return null;
    if (name) store.contacts[contactIndex].name = name.trim();
    if (phone) store.contacts[contactIndex].phone = phone.trim();
    store.contacts[contactIndex].updatedAt = new Date().toISOString();
    saveStore();
    return store.contacts[contactIndex];
  },

  async delete(_id, userId) {
    if (isMongoConnected()) {
      const result = await Contact.deleteOne({ _id, userId });
      return result.deletedCount > 0;
    }

    const initialLength = store.contacts.length;
    store.contacts = store.contacts.filter(c => !(c._id === _id && c.userId === userId.toString()));
    const deleted = store.contacts.length < initialLength;
    if (deleted) saveStore();
    return deleted;
  }
};

// --- Lead Operations ---
const LeadStore = {
  async create(data) {
    if (isMongoConnected()) {
      return await Lead.create(data);
    }
    const lead = { _id: generateId(), ...data, createdAt: new Date().toISOString() };
    if (!store.leads) store.leads = [];
    store.leads.push(lead);
    saveStore();
    return lead;
  },

  async createBulk(leads) {
    if (isMongoConnected()) {
      return await Lead.insertMany(leads);
    }
    if (!store.leads) store.leads = [];
    const newLeads = leads.map(l => ({ _id: generateId(), ...l, createdAt: new Date().toISOString() }));
    store.leads.push(...newLeads);
    saveStore();
    return newLeads;
  },

  async findById(id) {
    if (isMongoConnected()) return await Lead.findById(id).lean();
    if (!store.leads) return null;
    return store.leads.find(l => l._id === id) || null;
  },

  async findByUser(userId) {
    if (isMongoConnected()) return await Lead.find({ userId }).sort({ createdAt: -1 }).lean();
    if (!store.leads) return [];
    return store.leads.filter(l => l.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async findByCampaign(campaignId) {
    if (isMongoConnected()) return await Lead.find({ campaignId }).sort({ createdAt: -1 }).lean();
    if (!store.leads) return [];
    return store.leads.filter(l => l.campaignId === campaignId);
  },

  async findDailyQueue(userId) {
    if (isMongoConnected()) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);

      const replies = await Lead.find({ userId, hasUnansweredReply: true }).sort({ lastReplyAt: -1 }).lean();
      const overdue = await Lead.find({ userId, status: 'callback', callbackDate: { $lt: now } }).sort({ callbackDate: 1 }).lean();
      const dueToday = await Lead.find({ userId, status: 'callback', callbackDate: { $gte: today, $lte: endOfDay } }).sort({ callbackDate: 1 }).lean();
      const interested = await Lead.find({ userId, status: 'interested', coldOutreachStopped: false }).sort({ 'assignment.priority': -1 }).lean();
      const newLeads = await Lead.find({ userId, status: 'new' }).sort({ 'assignment.priority': -1 }).limit(50).lean();

      return { replies, overdue, dueToday, interested, newLeads };
    }
    if (!store.leads) return { replies: [], overdue: [], dueToday: [], interested: [], newLeads: [] };
    const userLeads = store.leads.filter(l => l.userId === userId);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(today); endOfDay.setHours(23, 59, 59, 999);
    return {
      replies: userLeads.filter(l => l.hasUnansweredReply).sort((a, b) => new Date(b.lastReplyAt || 0) - new Date(a.lastReplyAt || 0)),
      overdue: userLeads.filter(l => l.status === 'callback' && l.callbackDate && new Date(l.callbackDate) < now),
      dueToday: userLeads.filter(l => l.status === 'callback' && l.callbackDate && new Date(l.callbackDate) >= today && new Date(l.callbackDate) <= endOfDay),
      interested: userLeads.filter(l => l.status === 'interested' && !l.coldOutreachStopped),
      newLeads: userLeads.filter(l => l.status === 'new').sort((a, b) => (b.assignment?.priority || 0) - (a.assignment?.priority || 0)).slice(0, 50)
    };
  },

  async findPendingByPhone(phone) {
    if (isMongoConnected()) return await Lead.find({ 'contact.phone': phone }).lean();
    if (!store.leads) return [];
    return store.leads.filter(l => l.contact?.phone === phone);
  },

  async findPendingByEmail(email) {
    if (isMongoConnected()) return await Lead.find({ 'contact.email': email.toLowerCase() }).lean();
    if (!store.leads) return [];
    return store.leads.filter(l => l.contact?.email?.toLowerCase() === email.toLowerCase());
  },

  async update(id, updateData) {
    if (isMongoConnected()) return await Lead.findByIdAndUpdate(id, updateData, { new: true }).lean();
    if (!store.leads) return null;
    const idx = store.leads.findIndex(l => l._id === id);
    if (idx === -1) return null;
    store.leads[idx] = { ...store.leads[idx], ...updateData };
    saveStore();
    return store.leads[idx];
  },

  async delete(id) {
    if (isMongoConnected()) { await Lead.findByIdAndDelete(id); return true; }
    if (!store.leads) return false;
    const len = store.leads.length;
    store.leads = store.leads.filter(l => l._id !== id);
    if (store.leads.length < len) { saveStore(); return true; }
    return false;
  },

  async countByUser(userId) {
    if (isMongoConnected()) return await Lead.countDocuments({ userId });
    if (!store.leads) return 0;
    return store.leads.filter(l => l.userId === userId).length;
  },

  async getManagerMetrics(userId) {
    if (isMongoConnected()) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const total = await Lead.countDocuments({ userId });
      const contacted = await Lead.countDocuments({ userId, status: { $ne: 'new' } });
      const interested = await Lead.countDocuments({ userId, status: 'interested' });
      const booked = await Lead.countDocuments({ userId, status: 'meeting-booked' });
      const callbacksOverdue = await Lead.countDocuments({ userId, status: 'callback', callbackDate: { $lt: now } });
      const untouched = await Lead.countDocuments({ userId, status: 'new' });
      return { total, contacted, interested, booked, callbacksOverdue, untouched };
    }
    if (!store.leads) return { total: 0, contacted: 0, interested: 0, booked: 0, callbacksOverdue: 0, untouched: 0 };
    const leads = store.leads.filter(l => l.userId === userId);
    const now = new Date();
    return {
      total: leads.length,
      contacted: leads.filter(l => l.status !== 'new').length,
      interested: leads.filter(l => l.status === 'interested').length,
      booked: leads.filter(l => l.status === 'meeting-booked').length,
      callbacksOverdue: leads.filter(l => l.status === 'callback' && l.callbackDate && new Date(l.callbackDate) < now).length,
      untouched: leads.filter(l => l.status === 'new').length
    };
  }
};

// --- Campaign Operations ---
const CampaignStore = {
  async create(data) {
    if (isMongoConnected()) return await Campaign.create(data);
    const campaign = { _id: generateId(), ...data, totalLeads: 0, createdAt: new Date().toISOString() };
    if (!store.campaigns) store.campaigns = [];
    store.campaigns.push(campaign);
    saveStore();
    return campaign;
  },

  async findAll() {
    if (isMongoConnected()) return await Campaign.find().sort({ createdAt: -1 }).lean();
    if (!store.campaigns) return [];
    return store.campaigns.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async findById(id) {
    if (isMongoConnected()) return await Campaign.findById(id).lean();
    if (!store.campaigns) return null;
    return store.campaigns.find(c => c._id === id) || null;
  },

  async update(id, data) {
    if (isMongoConnected()) return await Campaign.findByIdAndUpdate(id, data, { new: true }).lean();
    if (!store.campaigns) return null;
    const idx = store.campaigns.findIndex(c => c._id === id);
    if (idx === -1) return null;
    store.campaigns[idx] = { ...store.campaigns[idx], ...data };
    saveStore();
    return store.campaigns[idx];
  },

  async delete(id) {
    if (isMongoConnected()) { await Campaign.findByIdAndDelete(id); return true; }
    if (!store.campaigns) return false;
    const len = store.campaigns.length;
    store.campaigns = store.campaigns.filter(c => c._id !== id);
    if (store.campaigns.length < len) { saveStore(); return true; }
    return false;
  }
};

// --- ActivityLog Operations ---
const ActivityLogStore = {
  async create(data) {
    if (isMongoConnected()) return await ActivityLog.create(data);
    const log = { _id: generateId(), ...data, timestamp: new Date().toISOString() };
    if (!store.activityLogs) store.activityLogs = [];
    store.activityLogs.unshift(log);
    saveStore();
    return log;
  },

  async findByLead(leadId) {
    if (isMongoConnected()) return await ActivityLog.find({ leadId }).sort({ timestamp: -1 }).lean();
    if (!store.activityLogs) return [];
    return store.activityLogs.filter(l => l.leadId === leadId).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  },

  async findByUser(userId, limit = 100) {
    if (isMongoConnected()) return await ActivityLog.find({ userId }).sort({ timestamp: -1 }).limit(limit).lean();
    if (!store.activityLogs) return [];
    return store.activityLogs.filter(l => l.userId === userId).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);
  },

  async getUserStats(userId) {
    if (isMongoConnected()) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const calls = await ActivityLog.countDocuments({ userId, action: 'call', timestamp: { $gte: today } });
      const emails = await ActivityLog.countDocuments({ userId, action: 'email', timestamp: { $gte: today } });
      const smss = await ActivityLog.countDocuments({ userId, action: 'sms', channel: { $ne: 'whatsapp' }, timestamp: { $gte: today } });
      const whatsapp = await ActivityLog.countDocuments({ userId, action: 'sms', channel: 'whatsapp', timestamp: { $gte: today } });
      const notes = await ActivityLog.countDocuments({ userId, action: 'note', timestamp: { $gte: today } });
      const totalTalkTime = await ActivityLog.aggregate([
        { $match: { userId: require('mongoose').Types.ObjectId.createFromHexString(userId), action: 'call', timestamp: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$duration' } } }
      ]);
      return { callsToday: calls, emailsToday: emails, smsToday: smss, whatsappToday: whatsapp, notesToday: notes, talkTimeToday: totalTalkTime[0]?.total || 0 };
    }
    if (!store.activityLogs) return { callsToday: 0, emailsToday: 0, smsToday: 0, whatsappToday: 0, notesToday: 0, talkTimeToday: 0 };
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const userLogs = store.activityLogs.filter(l => l.userId === userId && new Date(l.timestamp) >= today);
    return {
      callsToday: userLogs.filter(l => l.action === 'call').length,
      emailsToday: userLogs.filter(l => l.action === 'email').length,
      smsToday: userLogs.filter(l => l.action === 'sms' && l.channel !== 'whatsapp').length,
      whatsappToday: userLogs.filter(l => l.action === 'sms' && l.channel === 'whatsapp').length,
      notesToday: userLogs.filter(l => l.action === 'note').length,
      talkTimeToday: userLogs.filter(l => l.action === 'call').reduce((sum, l) => sum + (l.duration || 0), 0)
    };
  }
};

// Initialize Zero-DB on load
loadStore();

// --- EmailTemplate Operations ---
const EmailTemplateStore = {
  async create(data) {
    if (isMongoConnected()) return await EmailTemplate.create(data);
    if (!store.emailTemplates) store.emailTemplates = [];
    const tpl = { _id: generateId(), ...data, createdAt: new Date().toISOString() };
    store.emailTemplates.push(tpl);
    saveStore();
    return tpl;
  },
  async findAll() {
    if (isMongoConnected()) return await EmailTemplate.find({ active: true }).sort({ createdAt: -1 }).lean();
    if (!store.emailTemplates) return [];
    return store.emailTemplates.filter(t => t.active !== false);
  },
  async findById(id) {
    if (isMongoConnected()) return await EmailTemplate.findById(id).lean();
    if (!store.emailTemplates) return null;
    return store.emailTemplates.find(t => t._id === id) || null;
  },
  async update(id, data) {
    if (isMongoConnected()) return await EmailTemplate.findByIdAndUpdate(id, data, { new: true }).lean();
    if (!store.emailTemplates) return null;
    const idx = store.emailTemplates.findIndex(t => t._id === id);
    if (idx === -1) return null;
    store.emailTemplates[idx] = { ...store.emailTemplates[idx], ...data };
    saveStore();
    return store.emailTemplates[idx];
  },
  async delete(id) {
    if (isMongoConnected()) { await EmailTemplate.findByIdAndDelete(id); return true; }
    if (!store.emailTemplates) return false;
    const len = store.emailTemplates.length;
    store.emailTemplates = store.emailTemplates.filter(t => t._id !== id);
    if (store.emailTemplates.length < len) { saveStore(); return true; }
    return false;
  }
};

// --- LoginSession Operations ---
const LoginSessionStore = {
  async create(data) {
    if (isMongoConnected()) return await LoginSession.create(data);
    if (!store.loginSessions) store.loginSessions = [];
    const session = { _id: generateId(), ...data, loginAt: new Date().toISOString() };
    store.loginSessions.push(session);
    saveStore();
    return session;
  },
  async findToday(userId) {
    const today = new Date().toISOString().slice(0, 10);
    if (isMongoConnected()) return await LoginSession.findOne({ userId, date: today }).lean();
    if (!store.loginSessions) return null;
    return store.loginSessions.find(s => s.userId === userId && s.date === today) || null;
  },
  async updateSession(id, data) {
    if (isMongoConnected()) return await LoginSession.findByIdAndUpdate(id, data, { new: true }).lean();
    if (!store.loginSessions) return null;
    const idx = store.loginSessions.findIndex(s => s._id === id);
    if (idx === -1) return null;
    store.loginSessions[idx] = { ...store.loginSessions[idx], ...data };
    saveStore();
    return store.loginSessions[idx];
  },
  async toggleBreak(userId) {
    const today = new Date().toISOString().slice(0, 10);
    let session;
    if (isMongoConnected()) {
      session = await LoginSession.findOne({ userId, date: today });
      if (!session) {
        session = await LoginSession.create({ userId, date: today });
      }
      const now = new Date();
      if (session.isOnBreak) {
        const breakStart = session.breakStartedAt ? new Date(session.breakStartedAt) : now;
        const elapsed = Math.floor((now - breakStart) / 1000);
        session.breakTimeSeconds = (session.breakTimeSeconds || 0) + elapsed;
        session.isOnBreak = false;
        session.breakStartedAt = null;
        session.lastActivityAt = now;
      } else {
        session.isOnBreak = true;
        session.breakStartedAt = now;
      }
      await session.save();
      return session.toObject();
    }
    session = await this.findToday(userId);
    if (!session) {
      session = await this.create({ userId, date: today, breakTimeSeconds: 0, isOnBreak: false });
    }
    const now = new Date();
    if (session.isOnBreak) {
      const breakStart = session.breakStartedAt ? new Date(session.breakStartedAt) : now;
      const elapsed = Math.floor((now - breakStart) / 1000);
      session.breakTimeSeconds = (session.breakTimeSeconds || 0) + elapsed;
      session.isOnBreak = false;
      session.breakStartedAt = null;
      session.lastActivityAt = now.toISOString();
    } else {
      session.isOnBreak = true;
      session.breakStartedAt = now.toISOString();
    }
    await this.updateSession(session._id, session);
    return session;
  },
  async getUserStats(userId) {
    const today = new Date().toISOString().slice(0, 10);
    let session;
    if (isMongoConnected()) {
      session = await LoginSession.findOne({ userId, date: today }).lean();
    } else {
      session = await this.findToday(userId);
    }
    let breakTime = session?.breakTimeSeconds || 0;
    if (session?.isOnBreak && session?.breakStartedAt) {
      breakTime += Math.floor((Date.now() - new Date(session.breakStartedAt).getTime()) / 1000);
    }
    return {
      activeTimeSeconds: session?.activeTimeSeconds || 0,
      dialingTimeSeconds: session?.dialingTimeSeconds || 0,
      breakTimeSeconds: breakTime,
      isOnBreak: !!session?.isOnBreak
    };
  }
};

// --- SendingInbox Operations (multi-inbox support & per-inbox daily counters) ---
const SendingInboxStore = {
  async createInbox(data) {
    if (isMongoConnected()) {
      return await SendingInbox.create(data);
    }
    if (!store.configuredInboxes) store.configuredInboxes = [];
    const newInbox = {
      _id: generateId(),
      name: data.name || 'Default Inbox',
      fromEmail: data.fromEmail || '',
      fromName: data.fromName || '',
      dailyLimit: data.dailyLimit || 50,
      status: 'healthy',
      active: true,
      createdBy: data.createdBy,
      dailyCounters: [],
      createdAt: new Date().toISOString()
    };
    store.configuredInboxes.push(newInbox);
    saveStore();
    return newInbox;
  },

  async findAllInboxes() {
    const today = new Date().toISOString().slice(0, 10);
    if (isMongoConnected()) {
      const inboxes = await SendingInbox.find({ active: { $ne: false }, name: { $exists: true, $ne: '' } }).lean();
      return inboxes.map(inbox => {
        const counter = (inbox.dailyCounters || []).find(c => c.date === today);
        return {
          ...inbox,
          emailsSentToday: counter ? counter.emailsSent : 0
        };
      });
    }
    if (!store.configuredInboxes) store.configuredInboxes = [];
    return store.configuredInboxes.filter(i => i.active !== false).map(inbox => {
      const counter = (inbox.dailyCounters || []).find(c => c.date === today);
      return {
        ...inbox,
        emailsSentToday: counter ? counter.emailsSent : 0
      };
    });
  },

  async findInboxById(id) {
    const today = new Date().toISOString().slice(0, 10);
    if (isMongoConnected()) {
      const inbox = await SendingInbox.findById(id).lean();
      if (!inbox) return null;
      const counter = (inbox.dailyCounters || []).find(c => c.date === today);
      return {
        ...inbox,
        emailsSentToday: counter ? counter.emailsSent : 0
      };
    }
    if (!store.configuredInboxes) return null;
    const inbox = store.configuredInboxes.find(i => i._id === id);
    if (!inbox) return null;
    const counter = (inbox.dailyCounters || []).find(c => c.date === today);
    return {
      ...inbox,
      emailsSentToday: counter ? counter.emailsSent : 0
    };
  },

  async updateInbox(id, data) {
    if (isMongoConnected()) {
      return await SendingInbox.findByIdAndUpdate(id, data, { new: true }).lean();
    }
    if (!store.configuredInboxes) return null;
    const idx = store.configuredInboxes.findIndex(i => i._id === id);
    if (idx === -1) return null;
    store.configuredInboxes[idx] = { ...store.configuredInboxes[idx], ...data };
    saveStore();
    return store.configuredInboxes[idx];
  },

  async deleteInbox(id) {
    if (isMongoConnected()) {
      await SendingInbox.findByIdAndUpdate(id, { active: false });
      return true;
    }
    if (!store.configuredInboxes) return false;
    const idx = store.configuredInboxes.findIndex(i => i._id === id);
    if (idx === -1) return false;
    store.configuredInboxes[idx].active = false;
    saveStore();
    return true;
  },

  async incrementInboxUsage(inboxId) {
    const today = new Date().toISOString().slice(0, 10);
    if (isMongoConnected()) {
      const inbox = await SendingInbox.findById(inboxId);
      if (!inbox) return null;
      if (!inbox.dailyCounters) inbox.dailyCounters = [];
      const counterIdx = inbox.dailyCounters.findIndex(c => c.date === today);
      if (counterIdx !== -1) {
        inbox.dailyCounters[counterIdx].emailsSent += 1;
      } else {
        inbox.dailyCounters.push({ date: today, emailsSent: 1 });
      }
      await inbox.save();
      return inbox.toObject();
    }
    if (!store.configuredInboxes) return null;
    const inbox = store.configuredInboxes.find(i => i._id === inboxId);
    if (!inbox) return null;
    if (!inbox.dailyCounters) inbox.dailyCounters = [];
    const counterIdx = inbox.dailyCounters.findIndex(c => c.date === today);
    if (counterIdx !== -1) {
      inbox.dailyCounters[counterIdx].emailsSent += 1;
    } else {
      inbox.dailyCounters.push({ date: today, emailsSent: 1 });
    }
    saveStore();
    return inbox;
  },

  // Backwards compatibility methods
  async getToday(userId) {
    const today = new Date().toISOString().slice(0, 10);
    if (isMongoConnected()) {
      let inbox = await SendingInbox.findOne({ userId, date: today }).lean();
      if (!inbox) {
        inbox = await SendingInbox.create({ userId, date: today, emailsSent: 0, smsSent: 0, callsMade: 0, status: 'healthy' });
        return inbox.toObject ? inbox.toObject() : inbox;
      }
      return inbox;
    }
    if (!store.sendingInboxes) store.sendingInboxes = [];
    let inbox = store.sendingInboxes.find(i => i.userId === userId && i.date === today);
    if (!inbox) {
      inbox = { _id: generateId(), userId, date: today, emailsSent: 0, smsSent: 0, callsMade: 0, status: 'healthy' };
      store.sendingInboxes.push(inbox);
      saveStore();
    }
    return inbox;
  },

  async incrementEmail(userId) {
    const today = new Date().toISOString().slice(0, 10);
    if (isMongoConnected()) {
      return await SendingInbox.findOneAndUpdate(
        { userId, date: today },
        { $inc: { emailsSent: 1 }, $setOnInsert: { status: 'healthy' } },
        { upsert: true, new: true }
      ).lean();
    }
    const inbox = await this.getToday(userId);
    inbox.emailsSent = (inbox.emailsSent || 0) + 1;
    saveStore();
    return inbox;
  },

  async incrementSms(userId) {
    const today = new Date().toISOString().slice(0, 10);
    if (isMongoConnected()) {
      return await SendingInbox.findOneAndUpdate(
        { userId, date: today },
        { $inc: { smsSent: 1 }, $setOnInsert: { status: 'healthy' } },
        { upsert: true, new: true }
      ).lean();
    }
    const inbox = await this.getToday(userId);
    inbox.smsSent = (inbox.smsSent || 0) + 1;
    saveStore();
    return inbox;
  },

  async incrementCalls(userId) {
    const today = new Date().toISOString().slice(0, 10);
    if (isMongoConnected()) {
      return await SendingInbox.findOneAndUpdate(
        { userId, date: today },
        { $inc: { callsMade: 1 }, $setOnInsert: { status: 'healthy' } },
        { upsert: true, new: true }
      ).lean();
    }
    const inbox = await this.getToday(userId);
    inbox.callsMade = (inbox.callsMade || 0) + 1;
    saveStore();
    return inbox;
  },

  async setStatus(userId, status) {
    const today = new Date().toISOString().slice(0, 10);
    if (isMongoConnected()) {
      return await SendingInbox.findOneAndUpdate({ userId, date: today }, { status }, { new: true }).lean();
    }
    const inbox = await this.getToday(userId);
    inbox.status = status;
    saveStore();
    return inbox;
  }
};

// --- EmailSequence Operations (drip campaigns) ---
const EmailSequenceStore = {
  async create(data) {
    if (isMongoConnected()) return await EmailSequence.create(data);
    if (!store.emailSequences) store.emailSequences = [];
    const seq = { _id: generateId(), ...data, createdAt: new Date().toISOString() };
    store.emailSequences.push(seq);
    saveStore();
    return seq;
  },
  async findAll() {
    if (isMongoConnected()) return await EmailSequence.find({ active: true }).sort({ createdAt: -1 }).lean();
    if (!store.emailSequences) return [];
    return store.emailSequences.filter(s => s.active !== false);
  },
  async findById(id) {
    if (isMongoConnected()) return await EmailSequence.findById(id).lean();
    if (!store.emailSequences) return null;
    return store.emailSequences.find(s => s._id === id) || null;
  },
  async update(id, data) {
    if (isMongoConnected()) return await EmailSequence.findByIdAndUpdate(id, data, { new: true }).lean();
    if (!store.emailSequences) return null;
    const idx = store.emailSequences.findIndex(s => s._id === id);
    if (idx === -1) return null;
    store.emailSequences[idx] = { ...store.emailSequences[idx], ...data };
    saveStore();
    return store.emailSequences[idx];
  },
  async delete(id) {
    if (isMongoConnected()) { await EmailSequence.findByIdAndDelete(id); return true; }
    if (!store.emailSequences) return false;
    const len = store.emailSequences.length;
    store.emailSequences = store.emailSequences.filter(s => s._id !== id);
    if (store.emailSequences.length < len) { saveStore(); return true; }
    return false;
  }
};

// --- WhatsAppTemplate Operations ---
const WhatsAppTemplateStore = {
  async create(data) {
    if (isMongoConnected()) return await WhatsAppTemplate.create(data);
    if (!store.whatsappTemplates) store.whatsappTemplates = [];
    const tpl = { _id: generateId(), ...data, createdAt: new Date().toISOString() };
    store.whatsappTemplates.push(tpl);
    saveStore();
    return tpl;
  },
  async findAll() {
    if (isMongoConnected()) return await WhatsAppTemplate.find({ active: true }).sort({ createdAt: -1 }).lean();
    if (!store.whatsappTemplates) return [];
    return store.whatsappTemplates.filter(t => t.active !== false);
  },
  async findById(id) {
    if (isMongoConnected()) return await WhatsAppTemplate.findById(id).lean();
    if (!store.whatsappTemplates) return null;
    return store.whatsappTemplates.find(t => t._id === id) || null;
  },
  async update(id, data) {
    if (isMongoConnected()) return await WhatsAppTemplate.findByIdAndUpdate(id, data, { new: true }).lean();
    if (!store.whatsappTemplates) return null;
    const idx = store.whatsappTemplates.findIndex(t => t._id === id);
    if (idx === -1) return null;
    store.whatsappTemplates[idx] = { ...store.whatsappTemplates[idx], ...data };
    saveStore();
    return store.whatsappTemplates[idx];
  },
  async delete(id) {
    if (isMongoConnected()) { await WhatsAppTemplate.findByIdAndDelete(id); return true; }
    if (!store.whatsappTemplates) return false;
    const len = store.whatsappTemplates.length;
    store.whatsappTemplates = store.whatsappTemplates.filter(t => t._id !== id);
    if (store.whatsappTemplates.length < len) { saveStore(); return true; }
    return false;
  }
};

module.exports = { UserStore, CallStore, MessageStore, ContactStore, LeadStore, CampaignStore, ActivityLogStore, EmailTemplateStore, LoginSessionStore, SendingInboxStore, EmailSequenceStore, WhatsAppTemplateStore };
