// The API's responses, from the holidays in src/lib/holidays.ts
import { dev } from '$app/env';
import {
	getYear,
	HOLIDAY_TYPES,
	years,
	type Holiday,
	type HolidayType,
	type YearHolidays
} from '../holidays.js';
import { LANGUAGES, TAGS, type Language } from '../languages.js';
import { nameIn, type Chosen } from './language.js';

const EVERY: HolidayType[] = [...HOLIDAY_TYPES];

/** ?type= as a comma-separated list if given, else every type, undefined for an unknown type */
export function chooseTypes(url: URL): HolidayType[] | undefined {
	const type = url.searchParams.get('type');
	if (type === null) return EVERY;

	const types = type.split(',');
	return types.every((t): t is HolidayType => HOLIDAY_TYPES.includes(t as HolidayType))
		? types
		: undefined;
}

/**
 * A year's holidays of the types asked for, after any that started the year before and run into
 * it, as a school holiday over the new year does
 */
function during(year: YearHolidays, types: HolidayType[]): Holiday[] {
	const before = getYear(String(year.year - 1))?.holidays ?? [];
	const first = `${year.year}-01-01`;
	return [...before.filter((h) => h.endDate && h.endDate >= first), ...year.holidays].filter((h) =>
		types.includes(h.type)
	);
}

/** The body of `GET /{year}`; the year's already in the path, so it isn't repeated */
export function inYear(year: YearHolidays, language: Language = 'en', types = EVERY) {
	return { holidays: during(year, types).map((h) => nameIn(h, language)) };
}

/**
 * The body of `GET /{year}/{month}`, without the year and month the path already gives.
 * A holiday that runs longer than a day is in every month it touches
 */
export function inMonth(
	year: YearHolidays,
	month: number,
	language: Language = 'en',
	types = EVERY
) {
	const prefix = `${year.year}-${String(month).padStart(2, '0')}-`;
	const [first, last] = [`${prefix}01`, `${prefix}31`];
	return {
		holidays: during(year, types)
			.filter((h) => h.date <= last && (h.endDate ?? h.date) >= first)
			.map((h) => nameIn(h, language))
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

export function typeNotFound(): Response {
	return json({ error: `type must be one or more of ${HOLIDAY_TYPES.join(', ')}` }, 400);
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
