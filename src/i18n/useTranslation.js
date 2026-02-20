import { useContext } from 'react';
import { LanguageContext } from './LanguageContext';
import translations from './translations';

export const useTranslation = () => {
  const { language } = useContext(LanguageContext);
  const dict = translations[language] || translations.es;

  const t = (key, params = {}) => {
    let text = dict[key] || translations.es[key] || key;
    for (const [name, value] of Object.entries(params)) {
      text = text.replace(`{${name}}`, String(value));
    }
    return text;
  };

  return { t, language };
};
