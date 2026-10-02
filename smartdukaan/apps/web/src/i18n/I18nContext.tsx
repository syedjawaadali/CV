import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DICTS, type Lang, type StringKey } from './strings';

interface I18nValue {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  t: (key: StringKey) => string;
  setLang: (lang: Lang) => void;
  toggle: () => void;
}

const I18nContext = createContext<I18nValue | null>(null);
const STORAGE_KEY = 'sd_lang';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return saved === 'ur' ? 'ur' : 'en';
  });

  const dir = lang === 'ur' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const value = useMemo<I18nValue>(() => {
    const setLang = (next: Lang) => {
      setLangState(next);
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    };
    return {
      lang,
      dir,
      t: (key) => DICTS[lang][key] ?? DICTS.en[key] ?? key,
      setLang,
      toggle: () => setLang(lang === 'en' ? 'ur' : 'en'),
    };
  }, [lang, dir]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
