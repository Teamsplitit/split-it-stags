const express = require('express');
const { body, param, validationResult } = require('express-validator');
const Channel = require('../models/Channel');
const User = require('../models/User');
const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');
const { auth } = require('../middleware/auth');
const { getNetBalances, simplifyDebts, toUserId } = require('../utils/debtSimplification');
const crypto = require('crypto');

const router = express.Router({ mergeParams: true });

function generateInviteCode() {
  return crypto.randomBytes(6).toString('hex');
}

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const channels = await Channel.find({ members: req.user._id })
      .populate('createdBy', 'email name')
      .populate('members', 'email name')
      .sort({ updatedAt: -1 });
    res.json({ channels });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', [
  body('name').trim().notEmpty(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    const channel = await Channel.create({
      name: req.body.name,
      createdBy: req.user._id,
      members: [req.user._id],
      inviteCode: generateInviteCode(),
    });
    await channel.populate(['createdBy', 'members']);
    res.status(201).json({ channel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:channelId', [
  param('channelId').isMongoId(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid channel id' });
    const channel = await Channel.findById(req.params.channelId)
      .populate('createdBy', 'email name')
      .populate('members', 'email name');
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (!channel.members.some(m => m._id.toString() === req.user._id.toString())) {
      return res.status(403).json({ error: 'Not a member' });
    }
    res.json({ channel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/join', [
  body('inviteCode').trim().notEmpty(),
], async (req, res) => {
  try {
    const channel = await Channel.findOne({ inviteCode: req.body.inviteCode.trim() });
    if (!channel) return res.status(404).json({ error: 'Invalid invite code' });
    if (channel.members.some(m => m.toString() === req.user._id.toString())) {
      return res.json({ channel: await channel.populate(['createdBy', 'members']) });
    }
    channel.members.push(req.user._id);
    await channel.save();
    await channel.populate(['createdBy', 'members']);
    res.json({ channel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:channelId/expenses', [
  param('channelId').isMongoId(),
], async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (!channel.members.some(m => m.toString() === req.user._id.toString())) {
      return res.status(403).json({ error: 'Not a member' });
    }
    const expenses = await Expense.find({ channel: req.params.channelId })
      .populate('paidBy', 'email name')
      .populate('contributions.user', 'email name')
      .populate('splits.user', 'email name')
      .sort({ createdAt: -1 });
    res.json({ expenses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:channelId/settlements', [
  param('channelId').isMongoId(),
], async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (!channel.members.some(m => m.toString() === req.user._id.toString())) {
      return res.status(403).json({ error: 'Not a member' });
    }
    const settlements = await Settlement.find({ channel: req.params.channelId })
      .populate('fromUser', 'email name')
      .populate('toUser', 'email name')
      .sort({ createdAt: -1 });
    res.json({ settlements });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:channelId/summary', [
  param('channelId').isMongoId(),
], async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.channelId)
      .populate('members', 'email name');
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (!channel.members.some(m => m._id.toString() === req.user._id.toString())) {
      return res.status(403).json({ error: 'Not a member' });
    }
    const expenses = await Expense.find({ channel: req.params.channelId }).lean();
    const settlements = await Settlement.find({ channel: req.params.channelId }).lean();
    const memberIds = channel.members.map(m => m._id);
    const netBalances = getNetBalances(expenses, settlements, memberIds);
    const simplified = simplifyDebts(netBalances);

    const balancesWithUser = Object.entries(netBalances).map(([userId, balance]) => {
      const member = channel.members.find(m => m._id.toString() === userId);
      return { user: member, balance: Math.round(balance * 100) / 100 };
    });

    const simplifiedWithUsers = simplified.map(({ fromUserId, toUserId, amount }) => ({
      fromUser: channel.members.find(m => m._id.toString() === fromUserId),
      toUser: channel.members.find(m => m._id.toString() === toUserId),
      amount,
    }));

    const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
    const spentByUser = {};
    memberIds.forEach(id => { spentByUser[id.toString()] = 0; });
    const memberIdStrs = new Set(memberIds.map(id => toUserId(id)));
    expenses.forEach(e => {
      const contribs = e.contributions && e.contributions.length > 0 ? e.contributions : (e.paidBy ? [{ user: e.paidBy, amount: e.amount }] : []);
      for (const c of contribs) {
        if (c && c.user != null && c.amount != null) {
          const id = toUserId(c.user);
          if (memberIdStrs.has(id)) spentByUser[id] = (spentByUser[id] || 0) + Number(c.amount);
        }
      }
    });
    const pieData = channel.members.map(m => ({
      userId: m._id,
      name: m.name || m.email,
      amount: Math.round((spentByUser[m._id.toString()] || 0) * 100) / 100,
    }));

    res.json({
      balances: balancesWithUser,
      simplifiedDebts: simplifiedWithUsers,
      pieData,
      totalSpent: Math.round(totalSpent * 100) / 100,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
