import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Update this to your laptop's IP address
export const API_BASE = 'http://172.25.230.131:4000';

export const api = axios.create({ 
  baseURL: API_BASE,
  timeout: 10000 // 10 second timeout
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Add response interceptor for better error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Cannot connect to server. Make sure backend is running on port 4000.');
    }
    throw error;
  }
);
