const mongoose = require('mongoose');

const splitEntrySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true, min: 0 },
}, { _id: false });

const contributionEntrySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true, min: 0.01 },
}, { _id: false });

const expenseSchema = new mongoose.Schema({
  channel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel',
    required: true,
  },
  paidBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  },
  contributions: [contributionEntrySchema],
  amount: {
    type: Number,
    required: true,
    min: 0.01,
  },
  description: {
    type: String,
    trim: true,
    default: '',
  },
  spentAt: {
    type: Date,
    required: false,
  },
  splitType: {
    type: String,
    enum: ['equal', 'custom'],
    default: 'equal',
  },
  splits: [splitEntrySchema],
}, { timestamps: true });

module.exports = mongoose.model('Expense', expenseSchema);
