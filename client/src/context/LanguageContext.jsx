import { createContext, useContext, useState, useEffect } from 'react';
import { locales, defaultLocale } from '../locales';

const LanguageContext = createContext();

const STORAGE_KEY = 'monopoly-language';

export function LanguageProvider({ children }) {
  const [currentLanguage, setCurrentLanguage] = useState(() => {
    // Try to get from localStorage, fallback to default
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY) || defaultLocale;
    }
    return defaultLocale;
  });

  const [translations, setTranslations] = useState(locales[defaultLocale]);

  useEffect(() => {
    setTranslations(locales[currentLanguage] || locales[defaultLocale]);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, currentLanguage);
    }
  }, [currentLanguage]);

  const t = (key, params = {}) => {
    let text = translations[key] || key;

    // Replace parameters like {name}
    Object.keys(params).forEach(param => {
      text = text.replace(new RegExp(`{${param}}`, 'g'), params[param]);
    });

    return text;
  };

  const changeLanguage = (language) => {
    if (locales[language]) {
      setCurrentLanguage(language);
    }
  };

  return (
    <LanguageContext.Provider value={{
      currentLanguage,
      changeLanguage,
      t,
      availableLanguages: Object.keys(locales)
    }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
