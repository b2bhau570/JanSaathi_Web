import { createContext, useContext } from 'react';
import type { SupportedLanguage, TranslationDictionary } from '../i18n/translations';

export interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: keyof TranslationDictionary, params?: Record<string, string | number>) => string;
}

export const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const ALL_SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  'or', 'hi', 'en', 'bn', 'te', 'ta', 'mr', 'gu',
  'kn', 'ml', 'pa', 'as', 'ur', 'ne', 'sa', 'mai',
  'kok', 'sd', 'doi', 'mni', 'sat', 'brx', 'ks',
];

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

