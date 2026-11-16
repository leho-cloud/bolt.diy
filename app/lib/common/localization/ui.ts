import { localized } from './language.mjs';

export function uiLanguage() {
  return typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'hu';
}

export function uiText(hungarian: string, english: string) {
  return localized(uiLanguage(), hungarian, english);
}
