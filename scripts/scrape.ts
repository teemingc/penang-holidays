import { readFile, writeFile } from 'node:fs/promises';
import type { Holiday, YearHolidays } from '../src/lib/holidays.ts';
import { translate } from '../src/lib/names.ts';
import { SOURCE_URL, schoolSourceUrls } from '../src/lib/source.ts';
import { parseHolidayPage } from './parse.ts';
import { readCalendar, schoolHolidays } from './school.ts';

const DATA_DIR = new URL('../data/', import.meta.url);

// The Penang portal returns HTTP 500 to clients without a browser user agent
const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const requested = process.argv.slice(2).map(Number);

const published = parseHolidayPage(await (await fetchSource(SOURCE_URL)).text());
const years = requested.length
	? published.filter(({ year }) => requested.includes(year))
	: published;

for (const year of requested) {
	if (!years.some((y) => y.year === year)) {
		throw new Error(
			`${year} is not published yet. Available: ${published.map((y) => y.year).join(', ')}`
		);
	}
}

for (const year of years) {
	const school = await scrapeSchoolHolidays(year.year);
	// by date, a public holiday before a school holiday that starts the same day
	year.holidays = [...year.holidays, ...school].sort((a, b) => a.date.localeCompare(b.date));

	await writeJson(`${year.year}.json`, year);
	console.log(
		`data/${year.year}.json: ${year.holidays.length - school.length} public holidays, ${school.length} school holidays`
	);
}

// the data is still written without them, the tests fail until they are added
const untranslated = new Set(
	years
		.flatMap((y) => y.holidays.map((h) => h.name))
		.filter((name) => !translate(name, 'en') || !translate(name, 'zh'))
);
for (const name of untranslated) {
	console.warn(`No English or Chinese name for "${name}"; add them to src/lib/names.ts`);
}

/**
 * The year's school holidays from the ministry's calendars. The ministry has no calendar for a
 * year it hasn't published yet, or published under another name: it redirects to a page of its
 * site instead. Then, or when a calendar can't be fetched, or the year has gone by, the school
 * holidays already in the year's file are kept.
 */
async function scrapeSchoolHolidays(year: number): Promise<Holiday[]> {
	// a year gone by is over and done with, so its calendars are only fetched when it's asked for
	const settled = year < new Date().getFullYear() && !requested.includes(year);

	if (!settled) {
		try {
			const calendars = await Promise.all(schoolSourceUrls(year).map(fetchCalendar));
			return schoolHolidays(calendars, year);
		} catch (error) {
			console.warn(`${error}; keeping the school holidays ${year} already has`);
		}
	}

	const existing = await readFile(new URL(`${year}.json`, DATA_DIR), 'utf8').catch(() => null);
	const holidays = existing ? (JSON.parse(existing) as YearHolidays).holidays : [];
	return holidays.filter((h) => h.type === 'school');
}

async function fetchCalendar(url: string): Promise<string[]> {
	const response = await fetchSource(url);
	if (!response.headers.get('content-type')?.includes('pdf')) {
		throw new Error(`No school calendar at ${url}`);
	}

	return readCalendar(new Uint8Array(await response.arrayBuffer()));
}

// The portal is slow and drops connections now and then, so retry a few times
async function fetchSource(url: string, attempts = 4): Promise<Response> {
	for (let attempt = 1; ; attempt++) {
		try {
			const response = await fetch(url, {
				headers: { 'user-agent': USER_AGENT },
				signal: AbortSignal.timeout(180_000)
			});

			if (!response.ok) {
				throw new Error(`${url} responded with HTTP ${response.status}`);
			}

			return response;
		} catch (error) {
			if (attempt >= attempts) throw error;

			console.warn(`Attempt ${attempt} failed (${error}), retrying in ${attempt * 10}s`);
			await new Promise((resolve) => setTimeout(resolve, attempt * 10_000));
		}
	}
}

async function writeJson(file: string, data: unknown) {
	await writeFile(new URL(file, DATA_DIR), JSON.stringify(data, null, '\t') + '\n');
}
