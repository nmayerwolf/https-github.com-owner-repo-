import React, { createContext, useContext, useMemo, useState } from 'react';

const LANGUAGE_KEY = 'horsai_language_v1';

const readInitialLanguage = () => {
  try {
    const stored = String(window.localStorage.getItem(LANGUAGE_KEY) || '').trim().toLowerCase();
    if (stored === 'es' || stored === 'en') return stored;
  } catch {
    // noop
  }
  return 'es';
};

const persistLanguage = (lang) => {
  try {
    window.localStorage.setItem(LANGUAGE_KEY, lang);
  } catch {
    // noop
  }
};

const noop = () => {};
const LanguageContext = createContext({ language: 'es', isSpanish: true, setLanguage: noop });

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(readInitialLanguage);

  const setLanguage = (next) => {
    const safe = String(next || '').toLowerCase() === 'es' ? 'es' : 'en';
    setLanguageState(safe);
    persistLanguage(safe);
  };

  const value = useMemo(
    () => ({
      language,
      isSpanish: language === 'es',
      setLanguage
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  return useContext(LanguageContext);
};
