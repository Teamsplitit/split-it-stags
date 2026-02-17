const express = require('express');
const { body, param, validationResult } = require('express-validator');
const Expense = require('../models/Expense');
const Channel = require('../models/Channel');
const { auth } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

router.use(auth);

router.post('/:channelId/expenses', [
  param('channelId').isMongoId(),
  body('amount').isFloat({ min: 0.01 }),
  body('description').optional().trim(),
  body('splitType').optional().isIn(['equal', 'custom']),
  body('splits').optional().isArray(),
  body('splits.*.user').optional().isMongoId(),
  body('splits.*.amount').optional().isFloat({ min: 0 }),
  body('paidBy').optional().isMongoId(),
  body('contributions').optional().isArray(),
  body('contributions.*.user').optional().isMongoId(),
  body('contributions.*.amount').optional().isFloat({ min: 0.01 }),
  body('splitBetween').optional().isArray(),
  body('splitBetween.*').optional().isMongoId(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    const channel = await Channel.findById(req.params.channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (!channel.members.some(m => m.toString() === req.user._id.toString())) {
      return res.status(403).json({ error: 'Not a member' });
    }
    const { amount, description, splitType, splits, paidBy, contributions, splitBetween } = req.body;
    const totalAmount = parseFloat(amount);
    const memberIds = channel.members.map(m => m.toString());

    const splitBetweenIds = Array.isArray(splitBetween) && splitBetween.length > 0
      ? splitBetween.filter(id => memberIds.includes((id || '').toString()))
      : null;
    const equalSplitMembers = splitBetweenIds && splitBetweenIds.length > 0
      ? splitBetweenIds.map(id => channel.members.find(m => m.toString() === (id || '').toString())).filter(Boolean)
      : channel.members;
    if (equalSplitMembers.length === 0) {
      return res.status(400).json({ error: 'At least one person must be included in the split' });
    }

    let finalContributions = [];
    if (Array.isArray(contributions) && contributions.length > 0) {
      const sum = contributions.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
      if (Math.abs(sum - totalAmount) > 0.02) {
        return res.status(400).json({ error: 'Contributions must sum to expense amount' });
      }
      for (const c of contributions) {
        const uid = (c.user || c.userId || '').toString();
        if (!memberIds.includes(uid)) return res.status(400).json({ error: 'All payers must be channel members' });
        finalContributions.push({ user: c.user || c.userId, amount: parseFloat(c.amount) });
      }
    } else {
      const payerId = (paidBy || req.user._id).toString();
      if (!memberIds.includes(payerId)) return res.status(400).json({ error: 'Payer must be a channel member' });
      finalContributions = [{ user: paidBy || req.user._id, amount: totalAmount }];
    }

    let finalSplits = [];
    if (splitType === 'custom' && Array.isArray(splits) && splits.length > 0) {
      const sum = splits.reduce((s, x) => s + (x.amount || 0), 0);
      if (Math.abs(sum - totalAmount) > 0.02) {
        return res.status(400).json({ error: 'Custom splits must sum to expense amount' });
      }
      finalSplits = splits.map(s => ({ user: s.user, amount: s.amount }));
    } else {
      const n = equalSplitMembers.length;
      const perPerson = Math.floor((totalAmount / n) * 100) / 100;
      const remainder = Math.round((totalAmount - perPerson * n) * 100) / 100;
      finalSplits = equalSplitMembers.map((member, i) => ({
        user: member._id || member,
        amount: i === 0 ? perPerson + remainder : perPerson,
      }));
    }

    const expense = await Expense.create({
      channel: req.params.channelId,
      paidBy: finalContributions[0]?.user,
      contributions: finalContributions,
      amount: totalAmount,
      description: description || '',
      splitType: splitType || 'equal',
      splits: finalSplits,
    });
    await expense.populate(['paidBy', 'contributions.user', 'splits.user']);
    res.status(201).json({ expense });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:channelId/expenses/:expenseId', [
  param('channelId').isMongoId(),
  param('expenseId').isMongoId(),
], async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (!channel.members.some(m => m.toString() === req.user._id.toString())) {
      return res.status(403).json({ error: 'Not a member' });
    }
    const expense = await Expense.findOne({
      _id: req.params.expenseId,
      channel: req.params.channelId,
    });
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    await expense.deleteOne();
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
