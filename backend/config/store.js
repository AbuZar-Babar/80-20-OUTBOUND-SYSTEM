const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '../../data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

// Default initial state
let store = {
  users: [],
  calls: [],
  messages: [],
  contacts: []
};

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load store from disk if exists
const loadStore = () => {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf8');
      store = JSON.parse(raw);
      if (!store.users) store.users = [];
      if (!store.calls) store.calls = [];
      if (!store.messages) store.messages = [];
      if (!store.contacts) store.contacts = [];
      console.log(`[Zero-DB Store] Loaded persistence file (${store.users.length} users, ${store.contacts.length} contacts)`);
    } else {
      saveStore();
    }
  } catch (err) {
    console.error('[Zero-DB Store] Load error, initializing fresh memory store:', err.message);
  }
};

// Save store to disk synchronously
const saveStore = () => {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('[Zero-DB Store] Save error:', err.message);
  }
};

// Helper generator for unique IDs
const generateId = () => Math.random().toString(36).substring(2, 11) + Date.now().toString(36);

// --- User Operations ---
const UserStore = {
  async findOne({ email }) {
    if (!email) return null;
    const user = store.users.find(u => u.email === email.toLowerCase());
    return user ? { ...user } : null;
  },

  async findById(id) {
    const user = store.users.find(u => u._id === id);
    if (!user) return null;
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  },

  async create({ name, email, password }) {
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
    return store.calls
      .filter(c => c.userId === userId.toString())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async findOneAndUpdate({ callSid }, updateData) {
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
    return store.messages
      .filter(m => m.userId === userId.toString())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
};

// --- Contact Operations ---
const ContactStore = {
  async create({ userId, name, phone }) {
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
    return store.contacts
      .filter(c => c.userId === userId.toString())
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async findOne({ _id, userId }) {
    return store.contacts.find(c => c._id === _id && c.userId === userId.toString()) || null;
  },

  async update(_id, userId, { name, phone }) {
    const contactIndex = store.contacts.findIndex(c => c._id === _id && c.userId === userId.toString());
    if (contactIndex === -1) return null;

    if (name) store.contacts[contactIndex].name = name.trim();
    if (phone) store.contacts[contactIndex].phone = phone.trim();
    store.contacts[contactIndex].updatedAt = new Date().toISOString();

    saveStore();
    return store.contacts[contactIndex];
  },

  async delete(_id, userId) {
    const initialLength = store.contacts.length;
    store.contacts = store.contacts.filter(c => !(c._id === _id && c.userId === userId.toString()));
    const deleted = store.contacts.length < initialLength;
    if (deleted) saveStore();
    return deleted;
  }
};

// Initialize load
loadStore();

module.exports = {
  UserStore,
  CallStore,
  MessageStore,
  ContactStore
};
