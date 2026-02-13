import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, setAuthFailureHandler, setToken } from '../api/apiClient';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [tokenState, setTokenState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sessionNotice, setSessionNotice] = useState('');

  const logout = (notice = '') => {
    setToken(null);
    setTokenState(null);
    setUser(null);
    setSessionNotice(notice);
  };

  useEffect(() => {
    setAuthFailureHandler(() => {
      logout('Tu sesión expiró. Volvé a iniciar sesión.');
    });

    return () => {
      setAuthFailureHandler(null);
    };
  }, []);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const out = await api.login(email, password);
      setToken(out.token);
      setTokenState(out.token);
      setUser(out.user || null);
      setSessionNotice('');
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
      setSessionNotice('');
      return out;
    } finally {
      setLoading(false);
    }
  };

  const clearSessionNotice = () => setSessionNotice('');

  const value = useMemo(
    () => ({
      user,
      token: tokenState,
      isAuthenticated: !!tokenState,
      loading,
      login,
      register,
      logout,
      sessionNotice,
      clearSessionNotice
    }),
    [user, tokenState, loading, sessionNotice]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
