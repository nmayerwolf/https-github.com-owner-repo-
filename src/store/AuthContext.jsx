import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, setAuthFailureHandler, setCsrfToken, setToken, setTokenUpdateHandler } from '../api/apiClient';

const AuthContext = createContext(null);
const AUTH_TOKEN_STORAGE_KEY = 'horsai_auth_token_v1';

const readPersistedToken = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return '';
    return String(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
};

const persistToken = (value) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const safe = String(value || '').trim();
    if (!safe) {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, safe);
  } catch {
    // noop
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [tokenState, setTokenState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionNotice, setSessionNotice] = useState('');

  const clearLocalSession = (notice = '') => {
    setToken(null);
    persistToken('');
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
    setTokenUpdateHandler((nextToken) => {
      const safe = String(nextToken || '').trim();
      persistToken(safe);
      if (safe) {
        setTokenState('bearer');
      } else {
        setTokenState(null);
      }
    });
    return () => {
      setTokenUpdateHandler(null);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      setLoading(true);
      const persisted = readPersistedToken();
      if (persisted) {
        setToken(persisted);
        setTokenState('bearer');
      }
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
        persistToken(out.token);
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
        persistToken(out.token);
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

  const completeOAuthWithToken = async (oauthToken) => {
    const next = String(oauthToken || '').trim();
    if (!next) return false;
    setLoading(true);
    try {
      setToken(next);
      persistToken(next);
      setTokenState('bearer');
      const me = await api.me();
      if (!me) {
        clearLocalSession('');
        return false;
      }
      setUser(me);
      setSessionNotice('');
      return true;
    } catch {
      clearLocalSession('');
      return false;
    } finally {
      setLoading(false);
    }
  };

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
      completeOAuthWithToken,
      sessionNotice,
      clearSessionNotice
    }),
    [user, tokenState, loading, sessionNotice]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
