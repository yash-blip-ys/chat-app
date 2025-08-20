import React, { useContext, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, StyleSheet, SafeAreaView, StatusBar, Alert, Modal } from 'react-native';
import { AuthContext } from '../state/AuthContext';
import { fetchMessages } from '../api/users';
import { getSocket } from '../socket';

export default function ChatScreen({ route, navigation }) {
  const { otherUser } = route.params;
  const { user } = useContext(AuthContext);
  
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  const [editText, setEditText] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);
  
  const flatListRef = useRef(null);
  const typingTimeout = useRef(null);

  // Initialize socket connection
  useEffect(() => {
    const initSocket = async () => {
      try {
        const socketInstance = await getSocket();
        setSocket(socketInstance);
        setIsConnected(socketInstance.connected);
        
        socketInstance.on('connect', () => {
          console.log('✅ Chat socket connected');
          setIsConnected(true);
        });
        
        socketInstance.on('disconnect', () => {
          console.log('❌ Chat socket disconnected');
          setIsConnected(false);
        });
        
        socketInstance.on('connect_error', (error) => {
          console.error('❌ Chat socket connection error:', error);
          setIsConnected(false);
        });
        
        // Handle new messages
        socketInstance.on('message:new', (msg) => {
          console.log('📨 New message received:', msg);
          handleNewMessage(msg);
        });
        
        // Handle typing events - EXTRA SAFETY CHECKS
        socketInstance.on('typing:start', (data) => {
          console.log('🔌 SOCKET: Typing start received:', data);
          console.log('🔌 SOCKET: Current user ID:', user.id);
          console.log('🔌 SOCKET: Event fromUserId:', data.fromUserId);
          
          // TRIPLE SAFETY CHECK: Don't process if it's from current user
          if (String(data.fromUserId) === String(user.id)) {
            console.log('🚫 SOCKET: BLOCKED - Event from self, ignoring completely');
            return;
          }
          
          // Additional check: only process if it's from the other user
          if (String(data.fromUserId) === String(otherUser.id)) {
            console.log('✅ SOCKET: VALID - Processing typing event from other user');
            handleTypingStart(data);
          } else {
            console.log('❌ SOCKET: INVALID - Event from unknown user, ignoring');
          }
        });
        
        socketInstance.on('typing:stop', (data) => {
          console.log('🔌 SOCKET: Typing stop received:', data);
          console.log('🔌 SOCKET: Current user ID:', user.id);
          console.log('🔌 SOCKET: Event fromUserId:', data.fromUserId);
          
          // TRIPLE SAFETY CHECK: Don't process if it's from current user
          if (String(data.fromUserId) === String(user.id)) {
            console.log('🚫 SOCKET: BLOCKED - Event from self, ignoring completely');
            return;
          }
          
          // Additional check: only process if it's from the other user
          if (String(data.fromUserId) === String(otherUser.id)) {
            console.log('✅ SOCKET: VALID - Processing typing event from other user');
            handleTypingStop(data);
          } else {
            console.log('❌ SOCKET: INVALID - Event from unknown user, ignoring');
          }
        });
        
        // Handle message status updates
        socketInstance.on('message:read', (data) => {
          console.log('👁️ Message read received:', data);
          updateMessageReadStatus(data.messageId);
        });
        
        socketInstance.on('message:delivered', (data) => {
          console.log('📬 Message delivered received:', data);
          updateMessageDeliveryStatus(data.messageId);
        });
        
        // Handle message edits and deletions
        socketInstance.on('message:edit', (data) => {
          console.log('✏️ Message edit received:', data);
          updateMessageText(data.messageId, data.newText);
        });
        
        socketInstance.on('message:deleteForMe', (data) => {
          console.log('🗑️ Message delete for me received:', data);
          removeMessage(data.messageId);
        });
        
        socketInstance.on('message:deleteForAll', (data) => {
          console.log('🗑️ Message delete for all received:', data);
          markMessageDeleted(data.messageId);
        });
        
        // Test connection
        socketInstance.emit('test:ping', { message: 'Hello server!' });
        socketInstance.on('test:pong', (data) => {
          console.log('✅ Server responded to test:', data);
        });
        
      } catch (error) {
        console.error('❌ Error initializing socket:', error);
      }
    };
    
    initSocket();
    
    return () => {
      if (socket) {
        socket.off('message:new');
        socket.off('typing:start');
        socket.off('typing:stop');
        socket.off('message:read');
        socket.off('message:delivered');
        socket.off('message:edit');
        socket.off('message:deleteForMe');
        socket.off('message:deleteForAll');
        socket.off('test:pong');
      }
    };
  }, [otherUser.id, user.id]);

  // Load existing messages
  useEffect(() => {
    const loadMessages = async () => {
      try {
        const messageList = await fetchMessages(otherUser.id);
        setMessages(messageList);
        console.log('📚 Loaded', messageList.length, 'messages');
      } catch (error) {
        console.error('❌ Failed to load messages:', error);
        Alert.alert('Error', 'Failed to load messages');
      }
    };
    
    loadMessages();
  }, [otherUser.id]);

  // Handle new messages
  const handleNewMessage = (msg) => {
    console.log('📨 Handling new message:', msg);
    
    const inThisChat = (String(msg.fromUserId) === String(otherUser.id) && String(msg.toUserId) === String(user.id)) || 
                      (String(msg.fromUserId) === String(user.id) && String(msg.toUserId) === String(otherUser.id));
    
    if (inThisChat) {
      const exists = messages.some(m => 
        m._id === msg._id || 
        m.clientId === msg.clientId || 
        (m.text === msg.text && 
         m.fromUserId === msg.fromUserId && 
         m.toUserId === msg.toUserId && 
         Math.abs(new Date(m.createdAt) - new Date(msg.createdAt)) < 2000)
      );
      
      if (!exists) {
        if (msg.clientId) {
          // Update local pending message
          setMessages(prev => prev.map(m => 
            m.clientId === msg.clientId ? { ...m, ...msg, pending: false, isLocal: false } : m
          ));
        } else {
          // Add new message
          setMessages(prev => [...prev, msg]);
        }
        
        scrollToBottom();
        
        // Mark message as delivered if we're the recipient
        if (String(msg.fromUserId) === String(otherUser.id) && String(msg.toUserId) === String(user.id)) {
          console.log('📬 Marking received message as delivered:', msg._id);
          markMessageAsDelivered(msg._id);
        }
      }
    }
  };

  // Mark message as read
  const markMessageAsRead = (messageId) => {
    if (socket && isConnected) {
      console.log('👁️ Marking message as read:', messageId);
      socket.emit('message:read', { messageId });
    }
  };

  // Update message read status
  const updateMessageReadStatus = (messageId) => {
    console.log('✅ Updating message read status:', messageId);
    setMessages(prev => prev.map(m => 
      m._id === messageId ? { ...m, readAt: new Date().toISOString() } : m
    ));
  };

  // Update message delivery status
  const updateMessageDeliveryStatus = (messageId) => {
    console.log('📬 Updating message delivery status:', messageId);
    setMessages(prev => prev.map(m => 
      m._id === messageId ? { ...m, deliveredAt: new Date().toISOString() } : m
    ));
  };

  // Mark message as delivered
  const markMessageAsDelivered = (messageId) => {
    if (socket && isConnected) {
      console.log('📬 Marking message as delivered:', messageId);
      socket.emit('message:delivered', { messageId });
    }
  };

  // Start editing a message
  const startEditing = (message) => {
    setEditingMessage(message);
    setEditText(message.text);
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingMessage(null);
    setEditText('');
  };

  // Save edited message
  const saveEdit = async () => {
    if (!editText.trim() || !editingMessage) return;
    
    try {
      setLoading(true);
      
      // Update local message immediately
      setMessages(prev => prev.map(m => 
        m._id === editingMessage._id 
          ? { ...m, text: editText.trim(), edited: true }
          : m
      ));
      
      // Send edit to server
      if (socket && isConnected) {
        socket.emit('message:edit', {
          messageId: editingMessage._id,
          newText: editText.trim(),
          toUserId: otherUser.id
        });
      }
      
      // Clear editing state
      cancelEditing();
      
    } catch (error) {
      console.error('❌ Error editing message:', error);
      Alert.alert('Error', 'Failed to edit message');
    } finally {
      setLoading(false);
    }
  };

  // Show delete options
  const showDeleteOptions = (message) => {
    setSelectedMessage(message);
    setShowDeleteModal(true);
  };

  // Delete message for me only
  const deleteForMe = async (messageId) => {
    try {
      setLoading(true);
      
      // Remove from local state
      setMessages(prev => prev.filter(m => m._id !== messageId));
      
      // Send delete request to server
      if (socket && isConnected) {
        socket.emit('message:deleteForMe', {
          messageId,
          toUserId: otherUser.id
        });
      }
      
      setShowDeleteModal(false);
      setSelectedMessage(null);
      
    } catch (error) {
      console.error('❌ Error deleting message:', error);
      Alert.alert('Error', 'Failed to delete message');
    } finally {
      setLoading(false);
    }
  };

  // Delete message for everyone
  const deleteForAll = async (messageId) => {
    try {
      setLoading(true);
      
      // Mark message as deleted locally
      setMessages(prev => prev.map(m => 
        m._id === messageId 
          ? { ...m, text: 'This message was deleted', deletedForAll: true }
          : m
      ));
      
      // Send delete request to server
      if (socket && isConnected) {
        socket.emit('message:deleteForAll', {
          messageId,
          toUserId: otherUser.id
        });
      }
      
      setShowDeleteModal(false);
      setSelectedMessage(null);
      
    } catch (error) {
      console.error('❌ Error deleting message for all:', error);
      Alert.alert('Error', 'Failed to delete message for all');
    } finally {
      setLoading(false);
    }
  };

  // Update message text (for edits)
  const updateMessageText = (messageId, newText) => {
    setMessages(prev => prev.map(m => 
      m._id === messageId ? { ...m, text: newText, edited: true } : m
    ));
  };

  // Remove message (for delete for me)
  const removeMessage = (messageId) => {
    setMessages(prev => prev.filter(m => m._id !== messageId));
  };

  // Mark message as deleted (for delete for all)
  const markMessageDeleted = (messageId) => {
    setMessages(prev => prev.map(m => 
      m._id === messageId 
        ? { ...m, text: 'This message was deleted', deletedForAll: true }
        : m
    ));
  };

  // Scroll to bottom
  const scrollToBottom = () => {
    if (flatListRef.current && messages.length > 0) {
      setTimeout(() => {
        flatListRef.current.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  // Emit typing events
  const emitTyping = async (event) => {
    if (socket && isConnected) {
      console.log(`📤 Emitting ${event} to user:`, otherUser.id, 'from user:', user.id);
      
      socket.emit(event, { 
        toUserId: otherUser.id,
        fromUserId: user.id
      });
    } else {
      console.log('❌ Cannot emit typing: socket not connected');
    }
  };

  // Handle text input changes
  const onChangeText = (text) => {
    console.log('⌨️ Input changed, length:', text.length);
    setInput(text);
    
    // Clear existing timeout
    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
    }
    
    // Emit typing start if there's text - this will be sent to OTHER user
    if (text.trim()) {
      console.log('⌨️ Emitting typing:start to other user');
      emitTyping('typing:start');
      
      // Stop typing after 1.5 seconds of no input
      typingTimeout.current = setTimeout(() => {
        console.log('⏰ Typing timeout, emitting typing:stop to other user');
        emitTyping('typing:stop');
      }, 1500);
    } else {
      // Stop typing immediately if no text
      console.log('⌨️ Emitting typing:stop to other user (no text)');
      emitTyping('typing:stop');
    }
  };

  // Handle typing events from other user - COMPLETELY REWRITTEN
  const handleTypingStart = (data) => {
    console.log('🔍 TYPING START DEBUG:');
    console.log('  - Event data:', data);
    console.log('  - Current user ID:', user.id);
    console.log('  - Other user ID:', otherUser.id);
    console.log('  - Event fromUserId:', data.fromUserId);
    console.log('  - Current typing state:', typing);
    
    // EXPLICIT CHECK: Only show typing if it's from the OTHER user AND NOT from current user
    const isFromOtherUser = String(data.fromUserId) === String(otherUser.id);
    const isNotFromCurrentUser = String(data.fromUserId) !== String(user.id);
    
    console.log('  - Is from other user?', isFromOtherUser);
    console.log('  - Is NOT from current user?', isNotFromCurrentUser);
    
    if (isFromOtherUser && isNotFromCurrentUser) {
      console.log('✅ VALID: Setting typing to true for other user');
      setTyping(true);
    } else {
      console.log('❌ INVALID: Ignoring typing event');
      console.log('  - Reason: Event from wrong user or from self');
    }
  };

  const handleTypingStop = (data) => {
    console.log('🔍 TYPING STOP DEBUG:');
    console.log('  - Event data:', data);
    console.log('  - Current user ID:', user.id);
    console.log('  - Other user ID:', otherUser.id);
    console.log('  - Event fromUserId:', data.fromUserId);
    console.log('  - Current typing state:', typing);
    
    // EXPLICIT CHECK: Only hide typing if it's from the OTHER user AND NOT from current user
    const isFromOtherUser = String(data.fromUserId) === String(otherUser.id);
    const isNotFromCurrentUser = String(data.fromUserId) !== String(user.id);
    
    console.log('  - Is from other user?', isFromOtherUser);
    console.log('  - Is NOT from current user?', isNotFromCurrentUser);
    
    if (isFromOtherUser && isNotFromCurrentUser) {
      console.log('✅ VALID: Setting typing to false for other user');
      setTyping(false);
    } else {
      console.log('❌ INVALID: Ignoring typing event');
      console.log('  - Reason: Event from wrong user or from self');
    }
  };

  // Send message
  const send = async () => {
    if (!input.trim() || !socket || !isConnected) return;
    
    setLoading(true);
    try {
      const messageText = input.trim();
      const clientId = `${Date.now()}_${Math.random()}`;
      setInput('');
      
      // Stop typing indicator
      emitTyping('typing:stop');
      
      // Create pending message
      const pendingMessage = {
        _id: clientId,
        fromUserId: user.id,
        toUserId: otherUser.id,
        text: messageText,
        createdAt: new Date().toISOString(),
        pending: true,
        deliveredAt: null,
        readAt: null,
        isLocal: true
      };
      
      // Add to messages
      setMessages(prev => [...prev, pendingMessage]);
      
      // Send via socket
      socket.emit('message:send', {
        toUserId: otherUser.id,
        text: messageText,
        clientId
      });
      
      // Scroll to bottom
      scrollToBottom();
      
    } catch (error) {
      console.error('❌ Error sending message:', error);
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  // Render message item
  const renderMessage = ({ item }) => {
    const mine = String(item.fromUserId) === String(user.id);
    
    // Handle deleted messages
    if (item.deletedForAll) {
      return (
        <View style={styles.deletedMessage}>
          <Text style={styles.deletedText}>This message was deleted</Text>
        </View>
      );
    }
    
    return (
      <View style={styles.messageContainer}>
        <TouchableOpacity
          style={[styles.messageBubble, mine ? styles.messageBubbleMine : styles.messageBubbleOther]}
          onLongPress={() => {
            if (mine && !item.pending) {
              showDeleteOptions(item);
            }
          }}
          activeOpacity={0.9}
        >
          <Text style={[styles.messageText, mine ? styles.messageTextMine : styles.messageTextOther]}>
            {item.text}
          </Text>
          
          {item.edited && (
            <Text style={[styles.messageTime, mine ? styles.messageTimeMine : styles.messageTimeOther]}>
              edited
            </Text>
          )}
          
          <Text style={[styles.messageTime, mine ? styles.messageTimeMine : styles.messageTimeOther]}>
            {new Date(item.createdAt).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
            {mine && (
              <Text style={[styles.readStatus, styles.readStatusMine]}>
                {item.readAt ? ' ✓✓' : item.deliveredAt ? ' ✓' : item.pending ? ' ⏳' : ''}
              </Text>
            )}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#2E7D32" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{otherUser.name}</Text>
            <Text style={styles.chatStatus}>
              {isConnected ? '🟢 Online' : '🔴 Connecting...'}
            </Text>
          </View>
        </View>
        
        <View style={styles.headerRight}>
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={() => {
              // Add more options here
              Alert.alert('More Options', 'Coming soon...');
            }}
          >
            <Text style={styles.headerButtonText}>⋯</Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView 
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        enabled={true}
      >
        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item._id || item.clientId}
          renderItem={renderMessage}
          style={styles.messagesContainer}
          contentContainerStyle={messages.length === 0 ? styles.emptyState : null}
          onContentSizeChange={scrollToBottom}
          onLayout={scrollToBottom}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                No messages yet{'\n'}Start the conversation!
              </Text>
            </View>
          }
        />
        
        {/* Typing Indicator */}
        {typing && (
          <View style={styles.typingIndicator}>
            <View style={styles.typingBubble}>
              <Text style={styles.typingText}>
                {otherUser.name} is typing...
              </Text>
            </View>
          </View>
        )}
        
        {/* Input Area */}
        <View style={[styles.inputContainer, { paddingBottom: Platform.OS === 'ios' ? 20 : 24 }]}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={onChangeText}
            placeholder="Type a message..."
            placeholderTextColor="#999"
            multiline
            maxLength={1000}
            textAlignVertical="center"
          />
          
          <TouchableOpacity 
            style={[
              styles.sendButton, 
              (!input.trim() || loading) && styles.sendButtonDisabled
            ]}
            onPress={send}
            disabled={!input.trim() || loading}
            activeOpacity={0.8}
          >
            <Text style={styles.sendButtonText}>
              {loading ? '⏳' : '→'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Delete Modal */}
      {showDeleteModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Delete Message</Text>
            <Text style={styles.modalSubtitle}>Choose an option:</Text>
            
            <TouchableOpacity 
              style={styles.deleteOption} 
              onPress={() => deleteForMe(selectedMessage._id)}
              activeOpacity={0.7}
            >
              <Text style={styles.deleteOptionText}>Delete for me</Text>
              <Text style={styles.deleteOptionSubtext}>Remove from your chat only</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.deleteOption} 
              onPress={() => deleteForAll(selectedMessage._id)}
              activeOpacity={0.7}
            >
              <Text style={styles.deleteOptionText}>Delete for everyone</Text>
              <Text style={styles.deleteOptionSubtext}>Remove for all users</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.cancelModalButton} 
              onPress={() => {
                setShowDeleteModal(false);
                setSelectedMessage(null);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelModalText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  keyboardContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    padding: 8,
    marginRight: 16,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 20,
    color: '#007AFF',
    fontWeight: '600',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 4,
  },
  chatStatus: {
    fontSize: 14,
    color: '#7f8c8d',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    padding: 8,
    marginLeft: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonText: {
    fontSize: 18,
    color: '#007AFF',
    fontWeight: '600',
  },
  messagesContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  messageContainer: {
    marginVertical: 3,
  },
  userMessage: {
    alignItems: 'flex-end',
  },
  otherMessage: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '85%',
    marginVertical: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  messageBubbleMine: {
    backgroundColor: '#007AFF',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 8,
  },
  messageBubbleOther: {
    backgroundColor: '#ffffff',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  messageTextMine: {
    color: '#ffffff',
  },
  messageTextOther: {
    color: '#2c3e50',
  },
  messageFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  editedIndicator: {
    fontSize: 11,
    color: '#999',
    marginRight: 8,
  },
  timestamp: {
    fontSize: 11,
    color: '#999',
  },
  readStatus: {
    fontSize: 12,
    marginTop: 4,
    opacity: 0.8,
  },
  readStatusMine: {
    color: '#ffffff',
    textAlign: 'right',
  },
  typingIndicator: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'flex-start',
  },
  typingBubble: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    maxWidth: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  typingText: {
    color: '#666',
    fontSize: 15,
    fontStyle: 'italic',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 20 : 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    // Add bottom margin to avoid navigation buttons
    marginBottom: Platform.OS === 'ios' ? 0 : 20,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: '#f8f9fa',
    color: '#2c3e50',
    marginRight: 12,
    maxHeight: 120,
    minHeight: 48,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
    minWidth: 56,
    minHeight: 48,
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  sendButtonDisabled: {
    backgroundColor: '#bdc3c7',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    color: '#7f8c8d',
    textAlign: 'center',
    lineHeight: 26,
  },
  messageActions: {
    position: 'absolute',
    right: 8,
    top: 8,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 8,
    padding: 6,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    color: '#2c3e50',
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#7f8c8d',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 22,
  },
  deleteOption: {
    backgroundColor: '#f8f9fa',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  deleteOptionText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 4,
  },
  deleteOptionSubtext: {
    fontSize: 14,
    color: '#7f8c8d',
    textAlign: 'center',
  },
  cancelModalButton: {
    backgroundColor: '#e0e0e0',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  cancelModalText: {
    color: '#2c3e50',
    fontSize: 17,
    fontWeight: '600',
  },
  deletedMessage: {
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    padding: 15,
    marginVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deletedText: {
    color: '#7f8c8d',
    fontSize: 14,
    textAlign: 'center',
  },
});
