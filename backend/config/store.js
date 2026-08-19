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
    if (isMongoConnected()) {
      const user = await User.create({
        name,
        email: email.toLowerCase(),
        password,
        role: role || 'user',
        approved: approved !== undefined ? approved : false
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
      role: role || 'user',
      approved: approved !== undefined ? approved : false,
      createdAt: new Date().toISOString()
    };
    store.users.push(newUser);
    saveStore();
    const { password: _, ...userWithoutPassword } = newUser;
    return userWithoutPassword;
  },

  async matchPassword(enteredPassword, hashedPassword) {
    return await bcrypt.compare(enteredPassword, hashedPassword);
  },

  async findPendingUsers() {
    if (isMongoConnected()) {
      return await User.find({ approved: false }).select('-password').lean();
    }
    return store.users
      .filter(u => u.approved === false)
      .map(({ password, ...rest }) => rest);
  },

  async findAllUsers() {
    if (isMongoConnected()) {
      return await User.find().select('-password').lean();
    }
    return store.users.map(({ password, ...rest }) => rest);
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

      const overdue = await Lead.find({ userId, status: 'callback', callbackDate: { $lt: now } }).sort({ callbackDate: 1 }).lean();
      const dueToday = await Lead.find({ userId, status: 'callback', callbackDate: { $gte: today, $lte: endOfDay } }).sort({ callbackDate: 1 }).lean();
      const interested = await Lead.find({ userId, status: 'interested', coldOutreachStopped: false }).sort({ 'assignment.priority': -1 }).lean();
      const newLeads = await Lead.find({ userId, status: 'new' }).sort({ 'assignment.priority': -1 }).limit(50).lean();

      return { overdue, dueToday, interested, newLeads };
    }
    if (!store.leads) return { overdue: [], dueToday: [], interested: [], newLeads: [] };
    const userLeads = store.leads.filter(l => l.userId === userId);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(today); endOfDay.setHours(23, 59, 59, 999);
    return {
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
      const smss = await ActivityLog.countDocuments({ userId, action: 'sms', timestamp: { $gte: today } });
      const notes = await ActivityLog.countDocuments({ userId, action: 'note', timestamp: { $gte: today } });
      const totalTalkTime = await ActivityLog.aggregate([
        { $match: { userId: require('mongoose').Types.ObjectId.createFromHexString(userId), action: 'call', timestamp: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$duration' } } }
      ]);
      return { callsToday: calls, emailsToday: emails, smsToday: smss, notesToday: notes, talkTimeToday: totalTalkTime[0]?.total || 0 };
    }
    if (!store.activityLogs) return { callsToday: 0, emailsToday: 0, smsToday: 0, notesToday: 0, talkTimeToday: 0 };
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const userLogs = store.activityLogs.filter(l => l.userId === userId && new Date(l.timestamp) >= today);
    return {
      callsToday: userLogs.filter(l => l.action === 'call').length,
      emailsToday: userLogs.filter(l => l.action === 'email').length,
      smsToday: userLogs.filter(l => l.action === 'sms').length,
      notesToday: userLogs.filter(l => l.action === 'note').length,
      talkTimeToday: userLogs.filter(l => l.action === 'call').reduce((sum, l) => sum + (l.duration || 0), 0)
    };
  }
};

// Initialize Zero-DB on load
loadStore();

module.exports = { UserStore, CallStore, MessageStore, ContactStore, LeadStore, CampaignStore, ActivityLogStore };
