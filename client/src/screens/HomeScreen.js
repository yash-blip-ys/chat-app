import React, { useContext, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, StyleSheet, Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchFriends, acceptFriendRequest, rejectFriendRequest, removeFriend } from '../api/friends';
import { AuthContext } from '../state/AuthContext';
import { getSocket } from '../socket';

export default function HomeScreen({ navigation }) {
  const { user, signOut } = useContext(AuthContext);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [onlineMap, setOnlineMap] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);

  // Initialize socket connection for online status
  useEffect(() => {
    const initSocket = async () => {
      try {
        const socketInstance = await getSocket();
        setSocket(socketInstance);
        
        // Listen for user online/offline events
        socketInstance.on('user:online', (data) => {
          console.log('🟢 User came online:', data.userId);
          setOnlineMap(prev => ({ ...prev, [data.userId]: true }));
        });
        
        socketInstance.on('user:offline', (data) => {
          console.log('🔴 User went offline:', data.userId);
          setOnlineMap(prev => ({ ...prev, [data.userId]: false }));
        });
        
        // Get initial online status for all friends
        if (friends.length > 0) {
          socketInstance.emit('users:getOnlineStatus', { 
            userIds: friends.map(f => f.id) 
          });
          
          socketInstance.on('users:onlineStatus', (status) => {
            console.log('📊 Received online status:', status);
            setOnlineMap(prev => ({ ...prev, ...status }));
          });
        }
        
      } catch (error) {
        console.error('❌ Failed to initialize socket for online status:', error);
      }
    };
    
    if (friends.length > 0) {
      initSocket();
    }
    
    return () => {
      if (socket) {
        socket.off('user:online');
        socket.off('user:offline');
        socket.off('users:onlineStatus');
      }
    };
  }, [friends]);

  // Load friends on component mount
  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      const { friends, friendRequests } = await fetchFriends();
      setFriends(friends);
      setFriendRequests(friendRequests);
      
      // Initialize all users as offline by default
      const initialOnlineMap = {};
      friends.forEach(friend => {
        initialOnlineMap[friend.id] = false; // Start as offline
      });
      setOnlineMap(initialOnlineMap);
      
      console.log('✅ Loaded friends:', friends.length, 'requests:', friendRequests.length);
    } catch (error) {
      console.error('❌ Failed to load friends:', error);
      Alert.alert('Error', 'Failed to load friends list');
    } finally {
      setLoading(false);
    }
  };

  const renderFriendRequest = ({ item }) => (
    <View style={styles.friendRequestCard}>
      <View style={styles.friendRequestInfo}>
        <Text style={styles.friendRequestName}>{item.from.name}</Text>
        <Text style={styles.friendRequestEmail}>{item.from.email}</Text>
      </View>
      <View style={styles.friendRequestActions}>
        <TouchableOpacity 
          style={styles.acceptButton}
          onPress={async () => {
            try {
              await acceptFriendRequest(item.id);
              await load(); // Refresh the list
              Alert.alert('Success', 'Friend request accepted!');
            } catch (error) {
              Alert.alert('Error', 'Failed to accept request: ' + error.message);
            }
          }}
        >
          <Text style={styles.acceptButtonText}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.rejectButton}
          onPress={async () => {
            try {
              await rejectFriendRequest(item.id);
              await load(); // Refresh the list
              Alert.alert('Success', 'Friend request rejected');
            } catch (error) {
              Alert.alert('Error', 'Failed to reject request: ' + error.message);
            }
          }}
        >
          <Text style={styles.rejectButtonText}>Reject</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderFriend = ({ item }) => {
    console.log(`🔍 Rendering friend ${item.name}:`, {
      unreadCount: item.unreadCount,
      lastMessage: item.lastMessage,
      hasUnread: item.unreadCount > 0
    });
    
    return (
      <TouchableOpacity 
        onPress={() => navigation.navigate('Chat', { otherUser: item })} 
        style={[styles.friendCard, item.unreadCount > 0 ? styles.unreadFriendCard : null]}
      >
        <View style={styles.friendInfo}>
          <View style={styles.friendHeader}>
            <View style={styles.nameAndStatus}>
              <Text style={[
                styles.friendName, 
                item.unreadCount > 0 ? styles.unreadName : null
              ]}>
                {item.name}
              </Text>
              <View style={styles.statusContainer}>
                <View style={[
                  styles.onlineDot, 
                  { backgroundColor: onlineMap[item.id] ? '#4CAF50' : '#BDBDBD' }
                ]} />
                <Text style={styles.friendStatus}>
                  {onlineMap[item.id] ? 'Online' : 'Offline'}
                </Text>
              </View>
            </View>
            
            {/* Unread Badge */}
            {item.unreadCount > 0 && (
              <View style={styles.unreadContainer}>
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadCount}>
                    {item.unreadCount > 99 ? '99+' : item.unreadCount}
                  </Text>
                </View>
                <View style={styles.unreadDot} />
              </View>
            )}
          </View>
          
          {/* Last Message */}
          {item.lastMessage ? (
            <View style={styles.messageContainer}>
              <Text style={[
                styles.lastMessage, 
                item.unreadCount > 0 ? styles.unreadMessage : null
              ]} numberOfLines={1}>
                {item.lastMessage.text}
              </Text>
              <Text style={styles.messageTime}>
                {new Date(item.lastMessage.createdAt).toLocaleTimeString([], { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </Text>
            </View>
          ) : (
            <Text style={styles.noMessages}>No messages yet</Text>
          )}
        </View>
        
        <View style={styles.friendActions}>
          <TouchableOpacity 
            style={styles.removeButton}
            onPress={async () => {
              Alert.alert(
                'Remove Friend',
                `Are you sure you want to remove ${item.name} from your friends?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { 
                    text: 'Remove', 
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await removeFriend(item.id);
                        await load(); // Refresh the list
                        Alert.alert('Success', 'Friend removed');
                      } catch (error) {
                        Alert.alert('Error', 'Failed to remove friend: ' + error.message);
                      }
                    }
                  }
                ]
              );
            }}
          >
            <Text style={styles.removeButtonText}>Remove</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chat Application</Text>
      </View>

      {/* Welcome Section */}
      <View style={styles.welcomeSection}>
        <Text style={styles.welcomeText}>Welcome, {user?.name}</Text>
        <Text style={styles.subtitleText}>Manage your connections and conversations</Text>
        
        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity 
            style={styles.addFriendsButton} 
            onPress={() => navigation.navigate('AddFriends')}
          >
            <Text style={styles.addFriendsText}>+ Add Friends</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.logoutButton} 
            onPress={signOut}
          >
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
        
      </View>

      {/* Friend Requests Section */}
      {friendRequests.length > 0 && (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Friend Requests ({friendRequests.length})</Text>
        </View>
      )}
      
      {friendRequests.length > 0 && (
        <FlatList
          data={friendRequests}
          renderItem={renderFriendRequest}
          keyExtractor={(item) => item.id}
          style={styles.friendRequestsList}
          horizontal
          showsHorizontalScrollIndicator={false}
        />
      )}

      {/* Friends Section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Friends ({friends.length})</Text>
      </View>

      {/* Friends List */}
      <FlatList
        data={friends}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        renderItem={renderFriend}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No friends yet</Text>
            <Text style={styles.emptySubtext}>Add friends to start chatting!</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: '#2c3e50',
    paddingTop: Platform.OS === 'ios' ? 50 : 40,
    paddingBottom: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  welcomeSection: {
    backgroundColor: 'white',
    padding: 16,
    margin: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  welcomeText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 4,
  },
  subtitleText: {
    fontSize: 13,
    color: '#7f8c8d',
    lineHeight: 18,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 10,
  },
  addFriendsButton: {
    backgroundColor: '#3498db',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    flex: 1,
    alignItems: 'center',
    shadowColor: '#3498db',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  addFriendsText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 13,
  },
  logoutButton: {
    backgroundColor: '#e74c3c',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    flex: 1,
    alignItems: 'center',
    shadowColor: '#e74c3c',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  logoutText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 13,
  },
  sectionHeader: {
    backgroundColor: '#ecf0f1',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#d5dbdb',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2c3e50',
  },
  friendRequestsList: {
    height: 90,
    marginTop: 6,
    paddingHorizontal: 10,
  },
  friendRequestCard: {
    backgroundColor: 'white',
    padding: 14,
    marginHorizontal: 5,
    marginVertical: 5,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
    minWidth: 240,
  },
  friendRequestInfo: {
    flex: 1,
  },
  friendRequestName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 2,
  },
  friendRequestEmail: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  friendRequestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  acceptButton: {
    backgroundColor: '#27ae60',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    shadowColor: '#27ae60',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 1,
  },
  acceptButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 11,
  },
  rejectButton: {
    backgroundColor: '#e74c3c',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    shadowColor: '#e74c3c',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 1,
  },
  rejectButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 11,
  },
  friendCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
  },
  unreadFriendCard: {
    backgroundColor: '#f8f9ff',
    borderLeftColor: '#FF3B30',
    shadowColor: '#FF3B30',
    shadowOpacity: 0.15,
  },
  friendInfo: {
    flex: 1,
    marginRight: 10,
  },
  friendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  nameAndStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  friendName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 4,
  },
  unreadName: {
    fontWeight: '700',
    color: '#1a1a1a',
    fontSize: 19,
  },
  friendStatus: {
    fontSize: 13,
    color: '#7f8c8d',
  },
  lastMessage: {
    fontSize: 14,
    color: '#7f8c8d',
    flex: 1,
    marginRight: 8,
  },
  unreadMessage: {
    fontWeight: '700',
    color: '#1a1a1a',
    fontSize: 15,
  },
  unreadBadge: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
    // Add subtle animation
    transform: [{ scale: 1.05 }],
  },
  unreadCount: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 6,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 3,
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  messageTime: {
    fontSize: 12,
    color: '#95a5a6',
    fontWeight: '500',
  },
  friendActions: {
    alignItems: 'center',
  },
  removeButton: {
    backgroundColor: '#e67e22',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    shadowColor: '#e67e22',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 1,
  },
  removeButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 10,
  },
  noMessages: {
    fontSize: 13,
    color: '#95a5a6',
    fontStyle: 'italic',
    marginTop: 4,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 15,
    color: '#7f8c8d',
    marginBottom: 5,
    fontWeight: '500',
  },
  emptySubtext: {
    fontSize: 12,
    color: '#bdc3c7',
    textAlign: 'center',
    lineHeight: 16,
  },
  unreadContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 6,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF3B30',
    marginLeft: 4,
  },
});
