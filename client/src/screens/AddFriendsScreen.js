import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, RefreshControl } from 'react-native';
import { fetchUsers, sendFriendRequest } from '../api/friends';

export default function AddFriendsScreen({ navigation }) {
  const [users, setUsers] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      console.log('AddFriendsScreen: Starting to load users...');
      console.log('AddFriendsScreen: About to call fetchUsers()...');
      
      const list = await fetchUsers();
      console.log('AddFriendsScreen: fetchUsers() completed successfully');
      console.log('AddFriendsScreen: Users loaded:', list);
      console.log('AddFriendsScreen: Users array length:', list?.length || 0);
      
      setUsers(list);
    } catch (error) {
      console.error('AddFriendsScreen: Error loading users:', error);
      console.error('AddFriendsScreen: Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      Alert.alert('Error', 'Failed to load users: ' + error.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSendRequest = async (userId, userName) => {
    try {
      await sendFriendRequest(userId);
      Alert.alert('Success', `Friend request sent to ${userName}!`);
      await load(); // Refresh the list
    } catch (error) {
      Alert.alert('Error', 'Failed to send friend request: ' + error.message);
    }
  };

  const getButtonStyle = (status) => {
    switch (status) {
      case 'pending':
        return { backgroundColor: '#FF9800', disabled: true };
      case 'accepted':
        return { backgroundColor: '#4CAF50', disabled: true };
      case 'rejected':
        return { backgroundColor: '#F44336', disabled: true };
      default:
        return { backgroundColor: '#2196F3', disabled: false };
    }
  };

  const getButtonText = (status) => {
    switch (status) {
      case 'pending':
        return 'Request Sent';
      case 'accepted':
        return 'Friends';
      case 'rejected':
        return 'Rejected';
      default:
        return 'Add Friend';
    }
  };

  const renderUser = ({ item }) => {
    const buttonStyle = getButtonStyle(item.friendRequestStatus);
    const buttonText = getButtonText(item.friendRequestStatus);
    
    return (
      <View style={styles.userCard}>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.name}</Text>
          <Text style={styles.userEmail}>{item.email}</Text>
        </View>
        <TouchableOpacity 
          style={[styles.addButton, buttonStyle]}
          onPress={() => handleSendRequest(item.id, item.name)}
          disabled={buttonStyle.disabled}
        >
          <Text style={styles.addButtonText}>{buttonText}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Friends</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Info Section */}
      <View style={styles.infoSection}>
        <Text style={styles.infoText}>Find and add new friends to start chatting!</Text>
      </View>

      {/* Users List */}
      <FlatList
        data={users}
        renderItem={renderUser}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No users found</Text>
            <Text style={styles.emptySubtext}>All users might already be your friends!</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#2E7D32',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  infoSection: {
    backgroundColor: 'white',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  infoText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  userCard: {
    backgroundColor: 'white',
    padding: 16,
    marginHorizontal: 20,
    marginVertical: 8,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
  },
  addButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  addButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});
