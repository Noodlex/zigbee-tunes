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

/**
 * Keeps the document's lang attribute in step with the active locale, for
 * screen readers, translation tools and browser hints.
 */
function applyDocumentLang(locale: SupportedLocale): void {
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}

const initialLocale = detectInitialLocale();

// index.html has to declare *something* before any script runs. Correct it as
// soon as the real locale is known: without this, only switching the language
// by hand ever updated the attribute, so a visitor who never touched the
// toggle got a page announcing itself in the wrong language.
applyDocumentLang(initialLocale);

export const i18n = createI18n({
  legacy: false, // Composition API mode
  locale: initialLocale,
  fallbackLocale: 'en',
  messages: { en, fr },
});

/** Switch the active locale and persist the choice to localStorage. */
export function setLocale(locale: SupportedLocale): void {
  i18n.global.locale.value = locale;
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, locale);
  applyDocumentLang(locale);
}

/** Current active locale. */
export function currentLocale(): SupportedLocale {
  return i18n.global.locale.value as SupportedLocale;
}
