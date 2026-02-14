import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, setAuthFailureHandler, setCsrfToken, setToken } from '../api/apiClient';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [tokenState, setTokenState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionNotice, setSessionNotice] = useState('');

  const clearLocalSession = (notice = '') => {
    setToken(null);
    setCsrfToken(null);
    setTokenState(null);
    setUser(null);
    setSessionNotice(notice);
  };

  const hydrateSession = async () => {
    try {
      const me = await api.me();
      const csrf = await api.getCsrf();
      setCsrfToken(csrf?.csrfToken || null);
      setUser(me || null);
      setTokenState('cookie');
      setSessionNotice('');
      return me;
    } catch {
      clearLocalSession('');
      return null;
    }
  };

  const refreshUser = async () => {
    try {
      const me = await api.me();
      setUser(me || null);
      return me;
    } catch {
      return null;
    }
  };

  const logout = async (notice = '', options = {}) => {
    const { remote = true } = options;

    if (remote) {
      try {
        await api.logout();
      } catch {
        // Keep local logout behavior even if backend fails.
      }
    }

    clearLocalSession(notice);
  };

  useEffect(() => {
    setAuthFailureHandler(() => {
      logout('Tu sesión expiró. Volvé a iniciar sesión.', { remote: false });
    });

    return () => {
      setAuthFailureHandler(null);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      setLoading(true);
      await hydrateSession();
      if (mounted) setLoading(false);
    };

    init();

    return () => {
      mounted = false;
    };
  }, []);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const out = await api.login(email, password);
      if (out?.token) {
        setToken(out.token);
        setTokenState(out.token);
      }
      await hydrateSession();
      return out;
    } finally {
      setLoading(false);
    }
  };

  const register = async (email, password) => {
    setLoading(true);
    try {
      const out = await api.register(email, password);
      if (out?.token) {
        setToken(out.token);
        setTokenState(out.token);
      }
      await hydrateSession();
      return out;
    } finally {
      setLoading(false);
    }
  };

  const completeOnboarding = async () => {
    const out = await api.updateMe({ onboardingCompleted: true });
    setUser(out || null);
    return out;
  };

  const clearSessionNotice = () => setSessionNotice('');

  const value = useMemo(
    () => ({
      user,
      token: tokenState,
      isAuthenticated: !!user,
      loading,
      login,
      register,
      logout,
      refreshUser,
      completeOnboarding,
      sessionNotice,
      clearSessionNotice
    }),
    [user, tokenState, loading, sessionNotice]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
