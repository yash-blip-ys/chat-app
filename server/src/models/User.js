import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  lastSeenAt: { type: Date, default: null },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  friendRequests: [{
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
  }],
  sentFriendRequests: [{
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

UserSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    lastSeenAt: this.lastSeenAt,
    friends: (this.friends || []).map(friend => friend.toString()),
    friendRequests: (this.friendRequests || []).map(req => ({
      id: req._id.toString(),
      from: req.from.toString(),
      status: req.status,
      createdAt: req.createdAt
    })),
    sentFriendRequests: (this.sentFriendRequests || []).map(req => ({
      id: req._id.toString(),
      to: req.to.toString(),
      status: req.status,
      createdAt: req.createdAt
    }))
  };
};

export default mongoose.model('User', UserSchema);


