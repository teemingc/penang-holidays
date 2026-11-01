// malay as the portal publishes it, plus english and chinese translations

export const LANGUAGES = ['ms', 'en', 'zh'] as const;
export type Language = (typeof LANGUAGES)[number];

/** tags for lang and Content-Language, chinese is simplified as written in malaysia */
export const TAGS: Record<Language, string> = { ms: 'ms', en: 'en', zh: 'zh-Hans-MY' };

export const isLanguage = (value: string): value is Language =>
	LANGUAGES.includes(value as Language);
