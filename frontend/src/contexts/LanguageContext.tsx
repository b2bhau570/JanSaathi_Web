import React, { useState } from 'react';
import type { SupportedLanguage, TranslationDictionary } from '../i18n/translations';
import { translations } from '../i18n/translations';
import { ALL_SUPPORTED_LANGUAGES, LanguageContext } from './useLanguage';

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlLang = urlParams.get('lang') as SupportedLanguage;
      if (urlLang && ALL_SUPPORTED_LANGUAGES.includes(urlLang)) {
        return urlLang;
      }
      const saved = localStorage.getItem('jansaathi_lang') as SupportedLanguage;
      if (saved && ALL_SUPPORTED_LANGUAGES.includes(saved)) {
        return saved;
      }
    } catch {
      // fallback
    }
    return 'en';
  });

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('jansaathi_lang', lang);
    } catch {
      // ignore
    }
  };

  const t = (key: keyof TranslationDictionary, params?: Record<string, string | number>): string => {
    const dict = translations[language] || translations.en;
    let text = dict[key] || translations.en[key] || String(key);

    if (params) {
      Object.entries(params).forEach(([pKey, pVal]) => {
        text = text.replace(new RegExp(`\\{${pKey}\\}`, 'g'), String(pVal));
      });
    }

    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};
