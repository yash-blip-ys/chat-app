import React, { useEffect, useMemo, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text, View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import HomeScreen from './src/screens/HomeScreen';
import ChatScreen from './src/screens/ChatScreen';
import AddFriendsScreen from './src/screens/AddFriendsScreen';
import { AuthContext } from './src/state/AuthContext';

const Stack = createNativeStackNavigator();

export default function App() {
  const [authToken, setAuthToken] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await AsyncStorage.getItem('token');
      const userJson = await AsyncStorage.getItem('user');
      console.log('App.js - Token found:', !!token);
      console.log('App.js - User found:', !!userJson);
      if (token && userJson) {
        setAuthToken(token);
        setCurrentUser(JSON.parse(userJson));
        console.log('App.js - User authenticated:', JSON.parse(userJson).name);
      } else {
        console.log('App.js - No authentication found, showing login');
      }
      setLoading(false);
    })();
  }, []);

  const authContext = useMemo(() => ({
    token: authToken,
    user: currentUser,
    signIn: async ({ token, user }) => {
      setAuthToken(token);
      setCurrentUser(user);
      await AsyncStorage.setItem('token', token);
      await AsyncStorage.setItem('user', JSON.stringify(user));
    },
    signOut: async () => {
      setAuthToken(null);
      setCurrentUser(null);
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');
    }
  }), [authToken, currentUser]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <AuthContext.Provider value={authContext}>
      <NavigationContainer>
        <Stack.Navigator>
          {authToken ? (
            <>
              <Stack.Screen name="Home" component={HomeScreen} />
              <Stack.Screen name="Chat" component={ChatScreen} />
              <Stack.Screen name="AddFriends" component={AddFriendsScreen} />
            </>
          ) : (
            <>
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Register" component={RegisterScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </AuthContext.Provider>
  );
}
