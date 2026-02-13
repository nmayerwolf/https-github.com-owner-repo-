import React, { createContext, useContext, useMemo, useState } from 'react';
import { api, setToken } from '../api/apiClient';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [tokenState, setTokenState] = useState(null);
  const [loading, setLoading] = useState(false);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const out = await api.login(email, password);
      setToken(out.token);
      setTokenState(out.token);
      setUser(out.user || null);
      return out;
    } finally {
      setLoading(false);
    }
  };

  const register = async (email, password) => {
    setLoading(true);
    try {
      const out = await api.register(email, password);
      setToken(out.token);
      setTokenState(out.token);
      setUser(out.user || null);
      return out;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setTokenState(null);
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      token: tokenState,
      isAuthenticated: !!tokenState,
      loading,
      login,
      register,
      logout
    }),
    [user, tokenState, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
