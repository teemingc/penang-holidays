import type { Holiday } from '../holidays.js';
import { isLanguage, type Language } from '../languages.js';
import { translate } from '../names.js';

export interface Chosen {
	language: Language;
	/** chosen by Accept-Language rather than ?lang=, so the response varies with the header */
	negotiated: boolean;
}

/** ?lang= if given, else the first known Accept-Language, else english, undefined for an unknown ?lang= */
export function chooseLanguage(url: URL, headers: Headers): Chosen | undefined {
	const lang = url.searchParams.get('lang');
	if (lang !== null) return isLanguage(lang) ? { language: lang, negotiated: false } : undefined;

	return { language: preferred(headers.get('accept-language')) ?? 'en', negotiated: true };
}

// matched by primary subtag, so zh-TW and en-GB count as zh and en
function preferred(header: string | null): Language | undefined {
	const ranges = (header ?? '').split(',').map((part) => {
		const [range = '', ...params] = part.split(';').map((s) => s.trim());
		const q = params.find((p) => p.startsWith('q='));
		return { language: range.toLowerCase().split('-')[0]!, q: q ? Number(q.slice(2)) : 1 };
	});

	return ranges
		.filter(({ q }) => q > 0)
		.sort((a, b) => b.q - a.q)
		.map(({ language }) => language)
		.find(isLanguage);
}

/** originalName keeps the name as published */
export type NamedHoliday = Holiday & { originalName?: string };

/** an untranslated name stays in malay without originalName */
export function nameIn(holiday: Holiday, language: Language): NamedHoliday {
	const name = language === 'ms' ? undefined : translate(holiday.name, language);
	if (!name) return holiday;

	const { date, endDate, type, tentative } = holiday;
	return { date, ...(endDate && { endDate }), name, originalName: holiday.name, type, tentative };
}
