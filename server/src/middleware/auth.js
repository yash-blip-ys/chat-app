import { verifyJwt } from '../utils/jwt.js';
import User from '../models/User.js';

export async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  const decoded = verifyJwt(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  const user = await User.findById(decoded.id);
  if (!user) return res.status(401).json({ error: 'User not found' });
  req.user = user;
  next();
}


