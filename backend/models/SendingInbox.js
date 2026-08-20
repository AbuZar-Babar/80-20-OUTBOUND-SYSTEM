const mongoose = require('mongoose');

const sendingInboxSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  date: {
    type: String,
    required: true,
    index: true
  },
  emailsSent: {
    type: Number,
    default: 0
  },
  smsSent: {
    type: Number,
    default: 0
  },
  callsMade: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['healthy', 'warming', 'throttled', 'flagged'],
    default: 'healthy'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

sendingInboxSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('SendingInbox', sendingInboxSchema);
