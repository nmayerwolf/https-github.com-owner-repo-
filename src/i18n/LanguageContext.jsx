import React, { createContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'horsai_language_v1';
const normalizeLanguage = (value) => (String(value || '').toLowerCase() === 'en' ? 'en' : 'es');

const readPersistedLanguage = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) return null;
    return normalizeLanguage(value);
  } catch {
    return null;
  }
};

const persistLanguage = (language) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_KEY, normalizeLanguage(language));
  } catch {
    // noop
  }
};

export const LanguageContext = createContext({ language: 'es', setLanguage: () => {} });

export const LanguageProvider = ({ children, initialLanguage = 'es' }) => {
  const [language, setLanguageState] = useState(() => readPersistedLanguage() || normalizeLanguage(initialLanguage));

  useEffect(() => {
    setLanguageState((prev) => {
      const next = normalizeLanguage(initialLanguage);
      return prev === next ? prev : next;
    });
  }, [initialLanguage]);

  const setLanguage = (next) => {
    const normalized = normalizeLanguage(next);
    setLanguageState(normalized);
    persistLanguage(normalized);
  };

  const value = useMemo(() => ({ language, setLanguage }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};
