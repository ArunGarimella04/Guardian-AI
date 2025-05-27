const mongoose = require('mongoose');

const EmergencySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  location: {
    lat: Number,
    lng: Number
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['active', 'resolved'],
    default: 'active'
  },
  notes: String,
  recordings: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Recording'
  }],
  resolvedAt: Date
});

module.exports = mongoose.model('Emergency', EmergencySchema);