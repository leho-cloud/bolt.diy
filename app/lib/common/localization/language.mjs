export const languageCookieName = 'muhely_language';

export function languageFromCookie(cookie) {
  return cookie?.split(';').some((entry) => entry.trim() === languageCookieName + '=en') ? 'en' : 'hu';
}

export function localized(language, hungarian, english) {
  return language === 'en' ? english : hungarian;
}

export function languageSwitchUrl(language, path = '/') {
  const params = new URLSearchParams({ lang: language === 'en' ? 'hu' : 'en', next: path });
  return '/nyelv?' + params;
}
