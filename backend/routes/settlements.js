const express = require('express');
const { body, param, validationResult } = require('express-validator');
const Settlement = require('../models/Settlement');
const Channel = require('../models/Channel');
const { auth } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

router.use(auth);

router.post('/:channelId/settlements', [
  param('channelId').isMongoId(),
  body('fromUser').isMongoId(),
  body('toUser').isMongoId(),
  body('amount').isFloat({ min: 0.01 }),
  body('note').optional().trim(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    const channel = await Channel.findById(req.params.channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (!channel.members.some(m => m.toString() === req.user._id.toString())) {
      return res.status(403).json({ error: 'Not a member' });
    }
    const { fromUser, toUser, amount, note } = req.body;
    if (fromUser === toUser) return res.status(400).json({ error: 'fromUser and toUser must differ' });
    const fromOk = channel.members.some(m => m.toString() === fromUser);
    const toOk = channel.members.some(m => m.toString() === toUser);
    if (!fromOk || !toOk) return res.status(400).json({ error: 'Both users must be channel members' });
    const settlement = await Settlement.create({
      channel: req.params.channelId,
      fromUser,
      toUser,
      amount: parseFloat(amount),
      note: note || '',
    });
    await settlement.populate(['fromUser', 'toUser']);
    res.status(201).json({ settlement });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:channelId/settlements/:settlementId', [
  param('channelId').isMongoId(),
  param('settlementId').isMongoId(),
], async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (!channel.members.some(m => m.toString() === req.user._id.toString())) {
      return res.status(403).json({ error: 'Not a member' });
    }
    const settlement = await Settlement.findOne({
      _id: req.params.settlementId,
      channel: req.params.channelId,
    });
    if (!settlement) return res.status(404).json({ error: 'Settlement not found' });
    await settlement.deleteOne();
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
