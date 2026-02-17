const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  inviteCode: {
    type: String,
    unique: true,
    sparse: true,
  },
}, { timestamps: true });

// Ensure creator is in members
channelSchema.pre('save', function (next) {
  if (this.createdBy && !this.members.some(m => m.toString() === this.createdBy.toString())) {
    this.members.unshift(this.createdBy);
  }
  next();
});

module.exports = mongoose.model('Channel', channelSchema);
