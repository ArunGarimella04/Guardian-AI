const mongoose = require('mongoose');

const RecordingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  emergency: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Emergency'
  },
  audioFile: {
    filename: String,
    contentType: String,
    data: Buffer
  },
  emotion: {
    type: Object,
    default: null
  },
  transcript: {
    type: String,
    default: null
  },
  isEmergencyRecording: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Recording', RecordingSchema);