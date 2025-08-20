import { api } from './client';

export async function fetchUsers() {
  const { data } = await api.get('/users');
  return data;
}

export async function fetchMessages(otherUserId) {
  const { data } = await api.get(`/conversations/${otherUserId}/messages`);
  return data;
}
