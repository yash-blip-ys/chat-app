import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, index: true },
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  text: { type: String, required: true },
  deliveredAt: { type: Date, default: null },
  readAt: { type: Date, default: null }
}, { timestamps: true });

export default mongoose.model('Message', MessageSchema);


