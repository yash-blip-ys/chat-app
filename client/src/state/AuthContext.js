import React from 'react';

export const AuthContext = React.createContext({
  token: null,
  user: null,
  signIn: async () => {
    console.warn('signIn not implemented');
  },
  signOut: async () => {
    console.warn('signOut not implemented');
  }
});

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
