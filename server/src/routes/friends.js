import express from 'express';
import User from '../models/User.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Test endpoint to check if route is working
router.get('/test', (req, res) => {
  console.log('Friends route test endpoint called');
  res.json({ message: 'Friends route is working', timestamp: new Date().toISOString() });
});

// Debug endpoint to see all users
router.get('/debug/users', async (req, res) => {
  try {
    const allUsers = await User.find({}).select('name email createdAt');
    console.log('Debug: All users found:', allUsers.length);
    res.json({ 
      totalUsers: allUsers.length, 
      users: allUsers.map(u => ({ id: u._id, name: u.name, email: u.email }))
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: 'Debug error' });
  }
});

// Get all users (excluding current user and friends)
router.get('/users', authMiddleware, async (req, res) => {
  try {
    console.log('Friends route: /users endpoint called');
    const currentUserId = req.user._id;
    console.log('Current user ID:', currentUserId);
    
    const currentUser = await User.findById(currentUserId).populate('friends');
    console.log('Current user found:', !!currentUser);
    console.log('Current user friends count:', currentUser?.friends?.length || 0);
    
    // Get users who are not friends and not the current user
    const users = await User.find({
      _id: { 
        $ne: currentUserId,
        $nin: (currentUser.friends || []).map(friend => friend._id)
      }
    }).select('name email lastSeenAt');
    
    console.log('Users found (excluding friends):', users.length);
    
    // Add friend request status for each user
    const usersWithStatus = users.map(user => {
      const sentRequest = (currentUser.sentFriendRequests || []).find(
        req => req.to.toString() === user._id.toString()
      );
      const receivedRequest = (currentUser.friendRequests || []).find(
        req => req.from.toString() === user._id.toString()
      );
      
      return {
        ...user.toPublicJSON(),
        friendRequestStatus: sentRequest ? sentRequest.status : 
                           receivedRequest ? receivedRequest.status : 'none'
      };
    });
    
    console.log('Users with status:', usersWithStatus.length);
    res.json(usersWithStatus);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get friends list
router.get('/friends', authMiddleware, async (req, res) => {
  try {
    console.log('Friends route: /friends endpoint called');
    const currentUserId = req.user._id;
    console.log('Current user ID for friends:', currentUserId);

    const currentUser = await User.findById(currentUserId)
      .populate('friends', 'name email lastSeenAt')
      .populate('friendRequests.from', 'name email');

    console.log('Current user found for friends:', !!currentUser);
    console.log('Friends count:', currentUser?.friends?.length || 0);
    console.log('Friend requests count:', currentUser?.friendRequests?.length || 0);

    // Get friends with unread counts and last messages
    const Message = (await import('../models/Message.js')).default;
    
    const friendsWithDetails = await Promise.all((currentUser.friends || []).map(async (friend) => {
      const [a, b] = [currentUserId, friend._id.toString()].sort();
      const conversationId = `${a}_${b}`;
      
      console.log(`🔍 Processing friend ${friend.name} with conversation: ${conversationId}`);
      
      // Get last message
      const lastMessage = await Message.findOne({ conversationId }).sort({ createdAt: -1 }).lean();
      
      // Count unread messages - messages sent TO current user that haven't been read
      const unreadCount = await Message.countDocuments({
        conversationId,
        toUserId: currentUserId,
        readAt: { $exists: false }
      });
      
      console.log(`📊 Friend ${friend.name}: unreadCount = ${unreadCount}, lastMessage = ${lastMessage ? lastMessage.text.substring(0, 30) : 'None'}`);
      console.log(`📊 Unread query: conversationId=${conversationId}, toUserId=${currentUserId}`);
      
      // Debug: Show all messages in this conversation
      const allMessages = await Message.find({ conversationId }).sort({ createdAt: -1 }).lean();
      console.log(`🔍 All messages in conversation ${conversationId}:`, allMessages.map(m => ({
        id: m._id.toString(),
        from: m.fromUserId.toString(),
        to: m.toUserId.toString(),
        text: m.text.substring(0, 20),
        readAt: m.readAt,
        deliveredAt: m.deliveredAt
      })));
      
      // Debug: Show unread messages specifically
      const unreadMessages = await Message.find({
        conversationId,
        toUserId: currentUserId,
        readAt: { $exists: false }
      }).lean();
      console.log(`🔴 Unread messages for ${friend.name}:`, unreadMessages.map(m => ({
        id: m._id.toString(),
        from: m.fromUserId.toString(),
        to: m.toUserId.toString(),
        text: m.text.substring(0, 20)
      })));
      
      return {
        ...friend.toPublicJSON(),
        lastMessage: lastMessage ? {
          id: lastMessage._id.toString(),
          text: lastMessage.text,
          createdAt: lastMessage.createdAt,
          fromUserId: lastMessage.fromUserId?.toString?.() || String(lastMessage.fromUserId),
          toUserId: lastMessage.toUserId?.toString?.() || String(lastMessage.toUserId),
          readAt: lastMessage.readAt || null
        } : null,
        unreadCount: unreadCount
      };
    }));

    res.json({
      friends: friendsWithDetails,
      friendRequests: (currentUser.friendRequests || [])
        .filter(req => req.status === 'pending')
        .map(req => ({
          id: req._id.toString(),
          from: req.from.toPublicJSON(),
          createdAt: req.createdAt
        }))
    });
  } catch (error) {
    console.error('Error fetching friends:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send friend request
router.post('/request', authMiddleware, async (req, res) => {
  try {
    const { toUserId } = req.body;
    const fromUserId = req.user._id;
    
    if (fromUserId.toString() === toUserId) {
      return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    }
    
    const toUser = await User.findById(toUserId);
    if (!toUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if request already exists
    const existingRequest = toUser.friendRequests.find(
      req => req.from.toString() === fromUserId.toString()
    );
    
    if (existingRequest) {
      return res.status(400).json({ error: 'Friend request already sent' });
    }
    
    // Add friend request to recipient
    toUser.friendRequests.push({
      from: fromUserId,
      status: 'pending'
    });
    
    // Add sent request to sender
    const fromUser = await User.findById(fromUserId);
    fromUser.sentFriendRequests.push({
      to: toUserId,
      status: 'pending'
    });
    
    await toUser.save();
    await fromUser.save();
    
    res.json({ message: 'Friend request sent successfully' });
  } catch (error) {
    console.error('Error sending friend request:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Accept friend request
router.post('/accept', authMiddleware, async (req, res) => {
  try {
    const { requestId } = req.body;
    const currentUserId = req.user._id;
    
    const currentUser = await User.findById(currentUserId);
    const request = currentUser.friendRequests.find(
      req => req._id.toString() === requestId
    );
    
    if (!request) {
      return res.status(404).json({ error: 'Friend request not found' });
    }
    
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request already processed' });
    }
    
    const fromUserId = request.from;
    
    // Update request status to accepted
    request.status = 'accepted';
    
    // Add to friends list for both users
    currentUser.friends.push(fromUserId);
    
    const fromUser = await User.findById(fromUserId);
    fromUser.friends.push(currentUserId);
    
    // Update sent request status
    const sentRequest = fromUser.sentFriendRequests.find(
      req => req.to.toString() === currentUserId.toString()
    );
    if (sentRequest) {
      sentRequest.status = 'accepted';
    }
    
    await currentUser.save();
    await fromUser.save();
    
    res.json({ message: 'Friend request accepted' });
  } catch (error) {
    console.error('Error accepting friend request:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reject friend request
router.post('/reject', authMiddleware, async (req, res) => {
  try {
    const { requestId } = req.body;
    const currentUserId = req.user._id;
    
    const currentUser = await User.findById(currentUserId);
    const request = currentUser.friendRequests.find(
      req => req._id.toString() === requestId
    );
    
    if (!request) {
      return res.status(404).json({ error: 'Friend request not found' });
    }
    
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request already processed' });
    }
    
    const fromUserId = request.from;
    
    // Update request status to rejected
    request.status = 'rejected';
    
    // Update sent request status
    const fromUser = await User.findById(fromUserId);
    const sentRequest = fromUser.sentFriendRequests.find(
      req => req.to.toString() === currentUserId.toString()
    );
    if (sentRequest) {
      sentRequest.status = 'rejected';
    }
    
    await currentUser.save();
    await fromUser.save();
    
    res.json({ message: 'Friend request rejected' });
  } catch (error) {
    console.error('Error rejecting friend request:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove friend
router.delete('/remove/:friendId', authMiddleware, async (req, res) => {
  try {
    const { friendId } = req.params;
    const currentUserId = req.user._id;
    
    const currentUser = await User.findById(currentUserId);
    const friend = await User.findById(friendId);
    
    if (!friend) {
      return res.status(404).json({ error: 'Friend not found' });
    }
    
    // Remove from friends list for both users
    currentUser.friends = currentUser.friends.filter(
      id => id.toString() !== friendId
    );
    friend.friends = friend.friends.filter(
      id => id.toString() !== currentUserId.toString()
    );
    
    await currentUser.save();
    await friend.save();
    
    res.json({ message: 'Friend removed successfully' });
  } catch (error) {
    console.error('Error removing friend:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
