import express from 'express';
import User from '../models/User.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Get only friends for messaging
router.get('/', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const currentUser = await User.findById(currentUserId).populate('friends');
    
    // Only return friends
    const friends = await User.find({
      _id: { $in: currentUser.friends }
    }).select('name email lastSeenAt');

    // Attach last message for each conversation (MVP simplicity: N queries)
    const Message = (await import('../models/Message.js')).default;

    const friendsWithLast = await Promise.all(friends.map(async (friend) => {
      const [a, b] = [currentUserId, friend._id.toString()].sort();
      const conversationId = `${a}_${b}`;
      const last = await Message.findOne({ conversationId }).sort({ createdAt: -1 }).lean();
      
      // Count unread messages
      const unreadCount = await Message.countDocuments({
        conversationId,
        toUserId: currentUserId,
        readAt: { $exists: false }
      });
      
      return {
        ...friend.toPublicJSON(),
        lastMessage: last ? {
          id: last._id.toString(),
          text: last.text,
          createdAt: last.createdAt,
          fromUserId: last.fromUserId?.toString?.() || String(last.fromUserId),
          toUserId: last.toUserId?.toString?.() || String(last.toUserId),
          readAt: last.readAt || null
        } : null,
        unreadCount: unreadCount
      };
    }));

    res.json(friendsWithLast);
  } catch (error) {
    console.error('Error fetching friends:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;


