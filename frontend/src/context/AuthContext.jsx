import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, setToken, setStoredUser, getStoredUser } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser());
  const [loading, setLoading] = useState(!!getStoredUser());

  useEffect(() => {
    const token = localStorage.getItem('splitit_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api('/api/auth/me')
      .then(({ user }) => {
        setUser(user);
        setStoredUser(user);
      })
      .catch(() => {
        setToken(null);
        setStoredUser(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { token, user: u } = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(token);
    setStoredUser(u);
    setUser(u);
    return u;
  };

  const signup = async (email, password, name) => {
    const { token, user: u } = await api('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name: name || '' }),
    });
    setToken(token);
    setStoredUser(u);
    setUser(u);
    return u;
  };

  const logout = () => {
    setToken(null);
    setStoredUser(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
