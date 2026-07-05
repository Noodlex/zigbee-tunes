import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import fr from './locales/fr.json';

export type SupportedLocale = 'en' | 'fr';

export const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'fr'];

const STORAGE_KEY = 'zt-locale';

/**
 * Detects the initial locale:
 * 1. Reads from localStorage if a previous choice was persisted.
 * 2. Falls back to navigator.language (only its primary subtag).
 * 3. Defaults to English.
 */
function detectInitialLocale(): SupportedLocale {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'fr') return stored;
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    const lang = navigator.language.toLowerCase().split('-')[0];
    if (lang === 'fr') return 'fr';
  }
  return 'en';
}

export const i18n = createI18n({
  legacy: false, // Composition API mode
  locale: detectInitialLocale(),
  fallbackLocale: 'en',
  messages: { en, fr },
});

/** Switch the active locale and persist the choice to localStorage. */
export function setLocale(locale: SupportedLocale): void {
  i18n.global.locale.value = locale;
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, locale);
  // Update the document lang attribute for accessibility / browser hints.
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}

/** Current active locale. */
export function currentLocale(): SupportedLocale {
  return i18n.global.locale.value as SupportedLocale;
}
