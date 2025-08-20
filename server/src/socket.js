import { verifyJwt } from './utils/jwt.js';
import Message from './models/Message.js';
import User from './models/User.js';

const onlineUsers = new Map(); // userId -> socketId

function getConversationId(userIdA, userIdB) {
  const [a, b] = [userIdA, userIdB].map(String).sort();
  return `${a}_${b}`;
}

export function configureSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    const decoded = token ? verifyJwt(token) : null;
    if (!decoded) return next(new Error('Unauthorized'));
    socket.userId = decoded.id;
    next();
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    console.log(`🔌 User ${userId} connected`);
    
    onlineUsers.set(userId, socket.id);
    await User.findByIdAndUpdate(userId, { lastSeenAt: new Date() });
    
    // Broadcast user online status
    io.emit('user:online', { userId });
    
    // Send current online users to the new connection
    const onlineUserIds = Array.from(onlineUsers.keys());
    socket.emit('users:onlineList', { userIds: onlineUserIds });

    socket.on('disconnect', async () => {
      console.log(`🔌 User ${userId} disconnected`);
      if (onlineUsers.get(userId) === socket.id) {
        onlineUsers.delete(userId);
        await User.findByIdAndUpdate(userId, { lastSeenAt: new Date() });
        io.emit('user:offline', { userId });
      }
    });

    // Get online status for specific users
    socket.on('users:getOnlineStatus', ({ userIds }) => {
      const status = {};
      userIds.forEach(id => {
        status[id] = onlineUsers.has(id);
      });
      socket.emit('users:onlineStatus', status);
    });

    // Test connection
    socket.on('test:ping', (data) => {
      console.log(`🧪 Test ping from user ${userId}:`, data);
      socket.emit('test:pong', { message: 'Hello client!', userId: userId });
    });

    // Typing indicators
    socket.on('typing:start', ({ toUserId, fromUserId }) => {
      console.log(`⌨️ Typing start: ${fromUserId} -> ${toUserId}`);
      const toSocketId = onlineUsers.get(String(toUserId));
      if (toSocketId) {
        io.to(toSocketId).emit('typing:start', { fromUserId: fromUserId || userId });
      }
    });

    socket.on('typing:stop', ({ toUserId, fromUserId }) => {
      console.log(`⏹️ Typing stop: ${fromUserId} -> ${toUserId}`);
      const toSocketId = onlineUsers.get(String(toUserId));
      if (toSocketId) {
        io.to(toSocketId).emit('typing:stop', { fromUserId: fromUserId || userId });
      }
    });

    // Message handling
    socket.on('message:send', async ({ toUserId, text, clientId }) => {
      if (!toUserId || !text) return;
      
      console.log(`📨 Message: ${userId} -> ${toUserId}: ${text}`);
      
      const conversationId = getConversationId(userId, toUserId);
      const message = await Message.create({
        conversationId,
        fromUserId: userId,
        toUserId,
        text
        // Remove deliveredAt: new Date() - let it be marked as delivered when actually received
      });

      const payload = { ...message.toObject(), clientId };
      
      // Send to sender
      socket.emit('message:new', payload);
      
      // Send to recipient if online
      const toSocketId = onlineUsers.get(String(toUserId));
      if (toSocketId) {
        io.to(toSocketId).emit('message:new', payload);
      }
    });

    // Handle message read
    socket.on('message:read', async ({ messageId }) => {
      try {
        console.log(`👁️ Marking message ${messageId} as read by user ${userId}`);
        
        const Message = (await import('./models/Message.js')).default;
        const message = await Message.findById(messageId);
        
        if (!message) {
          console.log(`❌ Message ${messageId} not found`);
          return;
        }
        
        // Only mark as read if the current user is the recipient
        if (String(message.toUserId) !== String(userId)) {
          console.log(`❌ User ${userId} is not the recipient of message ${messageId}`);
          return;
        }
        
        // Update message read status
        message.readAt = new Date();
        await message.save();
        
        console.log(`✅ Message ${messageId} marked as read`);
        
        // Notify sender that message was read
        const senderSocketId = onlineUsers.get(String(message.fromUserId));
        if (senderSocketId) {
          io.to(senderSocketId).emit('message:read', { messageId });
          console.log(`📤 Notified sender ${message.fromUserId} that message ${messageId} was read`);
        }
        
      } catch (error) {
        console.error('❌ Error marking message as read:', error);
      }
    });

    // Message delivery receipts
    socket.on('message:delivered', async ({ messageId }) => {
      const msg = await Message.findById(messageId);
      if (!msg) return;
      
      if (String(msg.toUserId) !== String(userId)) return; // only recipient can mark delivered
      
      if (!msg.deliveredAt) {
        msg.deliveredAt = new Date();
        await msg.save();
        console.log(`📬 Message ${messageId} marked as delivered`);
        
        // Notify sender that message was delivered
        const fromSocketId = onlineUsers.get(String(msg.fromUserId));
        if (fromSocketId) {
          io.to(fromSocketId).emit('message:delivered', { messageId: msg._id.toString() });
        }
      }
    });

    // Message editing
    socket.on('message:edit', async ({ messageId, newText, toUserId }) => {
      const msg = await Message.findById(messageId);
      if (!msg) return;
      
      if (String(msg.fromUserId) !== String(userId)) return; // only sender can edit
      
      msg.text = newText;
      msg.edited = true;
      await msg.save();
      console.log(`✏️ Message ${messageId} edited`);
      
      const payload = { messageId: msg._id.toString(), newText };
      
      // Send to sender
      socket.emit('message:edit', payload);
      
      // Send to recipient if online
      const toSocketId = onlineUsers.get(String(toUserId));
      if (toSocketId) {
        io.to(toSocketId).emit('message:edit', payload);
      }
    });

    // Message deletion
    socket.on('message:deleteForMe', async ({ messageId, toUserId }) => {
      console.log(`🗑️ Message ${messageId} deleted for user ${userId}`);
      
      // Notify recipient if online
      const toSocketId = onlineUsers.get(String(toUserId));
      if (toSocketId) {
        io.to(toSocketId).emit('message:deleteForMe', { messageId });
      }
    });

    socket.on('message:deleteForAll', async ({ messageId, toUserId }) => {
      const msg = await Message.findById(messageId);
      if (!msg) return;
      
      if (String(msg.fromUserId) !== String(userId)) return; // only sender can delete for all
      
      msg.deletedForAll = true;
      msg.text = 'This message was deleted';
      await msg.save();
      console.log(`🗑️ Message ${messageId} deleted for all`);
      
      const payload = { messageId: msg._id.toString() };
      
      // Send to sender
      socket.emit('message:deleteForAll', payload);
      
      // Send to recipient if online
      const toSocketId = onlineUsers.get(String(toUserId));
      if (toSocketId) {
        io.to(toSocketId).emit('message:deleteForAll', payload);
      }
    });
  });
}


