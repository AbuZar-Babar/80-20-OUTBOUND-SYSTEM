const mongoose = require('mongoose');

const loginSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  loginAt: {
    type: Date,
    default: Date.now
  },
  logoutAt: {
    type: Date
  },
  lastActivityAt: {
    type: Date,
    default: Date.now
  },
  activeTimeSeconds: {
    type: Number,
    default: 0
  },
  dialingTimeSeconds: {
    type: Number,
    default: 0
  },
  date: {
    type: String,
    index: true
  }
});

loginSessionSchema.index({ userId: 1, date: 1 });

module.exports = mongoose.model('LoginSession', loginSessionSchema);
