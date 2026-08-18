const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { isMongoConnected } = require('./db');

// Mongoose models (used when MongoDB is connected)
const User = require('../models/User');
const Call = require('../models/Call');
const Message = require('../models/Message');
const Contact = require('../models/Contact');

// Zero-DB local persistence
const DATA_DIR = path.join(__dirname, '../../data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

let store = { users: [], calls: [], messages: [], contacts: [] };

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const loadStore = () => {
  try {
    if (fs.existsSync(STORE_FILE)) {
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
    console.error('[Zero-DB] Load error:', err.message);
  }
};

const saveStore = () => {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('[Zero-DB] Save error:', err.message);
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

  async create({ name, email, password }) {
    if (isMongoConnected()) {
      const user = await User.create({ name, email: email.toLowerCase(), password });
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
      createdAt: new Date().toISOString()
    };
    store.users.push(newUser);
    saveStore();
    const { password: _, ...userWithoutPassword } = newUser;
    return userWithoutPassword;
  },

  async matchPassword(enteredPassword, hashedPassword) {
    return await bcrypt.compare(enteredPassword, hashedPassword);
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

// Initialize Zero-DB on load
loadStore();

module.exports = { UserStore, CallStore, MessageStore, ContactStore };
