export type HolidayType = 'federal' | 'state';

export interface Holiday {
	/** ISO date, e.g. `2026-02-17` */
	date: string;
	/** Name as published on the portal, in Malay */
	name: string;
	type: HolidayType;
	/** Marked `( * ) Tertakluk kepada perubahan` (subject to change) on the portal */
	tentative: boolean;
}

export interface YearHolidays {
	year: number;
	holidays: Holiday[];
}

// Bundled at build time; each commit to data/ triggers a new build and deploy
const files = import.meta.glob<YearHolidays>('/data/*.json', { eager: true, import: 'default' });

/** Every scraped year, oldest first */
export const years = Object.values(files).sort((a, b) => a.year - b.year);

export function getYear(param: string): YearHolidays | undefined {
	return years.find((y) => String(y.year) === param);
}

/** The body of `GET /{year}`; the year's already in the path, so it isn't repeated */
export function inYear(year: YearHolidays) {
	return { holidays: year.holidays };
}

/** The body of `GET /{year}/{month}`, without the year and month the path already gives */
export function inMonth(year: YearHolidays, month: number) {
	const prefix = `${year.year}-${String(month).padStart(2, '0')}-`;
	return { holidays: year.holidays.filter((h) => h.date.startsWith(prefix)) };
}

export function yearNotFound(param: string): Response {
	if (!/^\d{4}$/.test(param)) {
		return json({ error: 'Use /{year} or /{year}/{month}, e.g. /2026 or /2026/3' }, 404);
	}

	return json({ error: `${param} is not available`, years: years.map((y) => y.year) }, 404);
}

// Cloudflare's cache (see wrangler.jsonc) and browsers reuse a successful response for an hour,
// so a scrape that changes the data shows up within the hour.
// Errors aren't cached, so a year that gets published shows up straight away.
const CACHE_CONTROL = 'public, max-age=3600';

export function json(body: unknown, status = 200): Response {
	return Response.json(body, {
		status,
		headers: {
			'access-control-allow-origin': '*',
			'cache-control': status === 200 ? CACHE_CONTROL : 'no-store'
		}
	});
}
