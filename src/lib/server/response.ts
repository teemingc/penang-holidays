// The API's responses, from the holidays in src/lib/holidays.ts
import { dev } from '$app/env';
import { years, type YearHolidays } from '../holidays.js';
import { LANGUAGES, TAGS, type Language } from '../languages.js';
import { nameIn, type Chosen } from './language.js';

/** The body of `GET /{year}`; the year's already in the path, so it isn't repeated */
export function inYear(year: YearHolidays, language: Language = 'en') {
	return { holidays: year.holidays.map((h) => nameIn(h, language)) };
}

/** The body of `GET /{year}/{month}`, without the year and month the path already gives */
export function inMonth(year: YearHolidays, month: number, language: Language = 'en') {
	const prefix = `${year.year}-${String(month).padStart(2, '0')}-`;
	return {
		holidays: year.holidays.filter((h) => h.date.startsWith(prefix)).map((h) => nameIn(h, language))
	};
}

export function yearNotFound(param: string): Response {
	if (!/^\d{4}$/.test(param)) {
		return json({ error: 'Use /{year} or /{year}/{month}, e.g. /2026 or /2026/3' }, 404);
	}

	return json({ error: `${param} is not available`, years: years.map((y) => y.year) }, 404);
}

export function languageNotFound(): Response {
	return json({ error: `lang must be one of ${LANGUAGES.join(', ')}` }, 400);
}

/** a negotiated language sets Vary so the cache keeps a copy per Accept-Language value */
export function named(body: unknown, { language, negotiated }: Chosen): Response {
	const response = json(body);
	response.headers.set('content-language', TAGS[language]);
	if (negotiated) response.headers.set('vary', 'Accept-Language');
	return response;
}

// Cloudflare's cache (see wrangler.jsonc) and browsers reuse a successful response for an hour,
// so a scrape that changes the data shows up within the hour.
// Errors aren't cached, so a year that gets published shows up straight away.
// the dev server caches nothing so changes show up on the next request
const CACHE_CONTROL = dev ? 'no-store' : 'public, max-age=3600';

export function json(body: unknown, status = 200): Response {
	return Response.json(body, {
		status,
		headers: {
			'access-control-allow-origin': '*',
			'cache-control': status === 200 ? CACHE_CONTROL : 'no-store'
		}
	});
}
