import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../api/client.js';

let socketInstance = null;

export async function getSocket() {
  if (socketInstance && socketInstance.connected) {
    return socketInstance;
  }
  
  const token = await AsyncStorage.getItem('token');
  if (!token) {
    throw new Error('No authentication token found');
  }
  
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
  
  console.log('🔌 Creating new socket connection to:', API_BASE);
  
  socketInstance = io(API_BASE, {
    transports: ['websocket', 'polling'],
    autoConnect: true,
    auth: { token },
    timeout: 10000,
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });
  
  socketInstance.on('connect', () => {
    console.log('✅ Socket connected successfully');
  });
  
  socketInstance.on('connect_error', (error) => {
    console.error('❌ Socket connection error:', error);
  });
  
  socketInstance.on('disconnect', (reason) => {
    console.log('🔌 Socket disconnected:', reason);
  });
  
  socketInstance.on('reconnect', (attemptNumber) => {
    console.log('🔄 Socket reconnected after', attemptNumber, 'attempts');
  });
  
  socketInstance.on('reconnect_error', (error) => {
    console.error('❌ Socket reconnection error:', error);
  });
  
  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    console.log('Disconnecting socket...');
    socketInstance.disconnect();
    socketInstance = null;
  }
}
