import type { UiLanguage } from '../components/TaxiLogin';

export const loadingCopy = {
  ar: {
    app: 'جاري التحميل...',
    session: '...',
    fleet: 'جاري تحميل البيانات...',
    vehicle: 'جاري تحميل السيارة...',
  },
  en: {
    app: 'Loading...',
    session: '...',
    fleet: 'Loading data...',
    vehicle: 'Loading vehicle...',
  },
} as const;

export function appDir(lang: UiLanguage): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}
