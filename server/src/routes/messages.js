import express from 'express';
import Message from '../models/Message.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// GET /conversations/:id/messages
// id is the other participant userId; conversationId is sorted pair `${minId}_${maxId}`
router.get('/:id/messages', authMiddleware, async (req, res) => {
  const otherUserId = req.params.id;
  const myId = req.user._id.toString();
  const [a, b] = [myId, otherUserId].sort();
  const conversationId = `${a}_${b}`;
  const messages = await Message.find({ conversationId }).sort({ createdAt: 1 });
  res.json(messages);
});

export default router;


