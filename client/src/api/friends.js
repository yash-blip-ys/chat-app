import { api } from './client';

// Get all users (excluding friends and current user)
export async function fetchUsers() {
  try {
    console.log('API: fetchUsers() called');
    console.log('API: Making GET request to /friends/users');
    
    const response = await api.get('/friends/users');
    console.log('API: Response received:', response);
    console.log('API: Response data:', response.data);
    
    return response.data;
  } catch (error) {
    console.error('API: Error in fetchUsers():', error);
    console.error('API: Error response:', error.response);
    console.error('API: Error status:', error.response?.status);
    console.error('API: Error data:', error.response?.data);
    throw error;
  }
}

// Get friends list and pending friend requests
export async function fetchFriends() {
  const { data } = await api.get('/friends/friends');
  return data;
}

// Send friend request
export async function sendFriendRequest(toUserId) {
  const { data } = await api.post('/friends/request', { toUserId });
  return data;
}

// Accept friend request
export async function acceptFriendRequest(requestId) {
  const { data } = await api.post('/friends/accept', { requestId });
  return data;
}

// Reject friend request
export async function rejectFriendRequest(requestId) {
  const { data } = await api.post('/friends/reject', { requestId });
  return data;
}

// Remove friend
export async function removeFriend(friendId) {
  const { data } = await api.delete(`/friends/remove/${friendId}`);
  return data;
}
