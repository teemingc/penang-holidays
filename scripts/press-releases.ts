// Looks for a new press release from the ministry that adds days off school, and adds the days
// it gives for Penang to scripts/press-releases.json and the year's file in data/.
// Writes what it did to the file named by its argument, for a pull request, when it adds any.
import { readFile, writeFile } from 'node:fs/promises';
import type { YearHolidays } from '../src/lib/holidays.ts';
import {
	addsSchoolHolidays,
	parseRelease,
	parseReleaseList,
	parseReleasePage,
	PRESS_URL
} from './press.ts';
import { joinDays, readCalendar } from './school.ts';

const PRESS_FILE = new URL('press-releases.json', import.meta.url);
const DATA_DIR = new URL('../data/', import.meta.url);

// A release is looked at for a few days after it's out, so a run that fails doesn't lose it
const DAYS = 3;
const DAY = 24 * 60 * 60 * 1000;

const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const [summaryFile] = process.argv.slice(2);
const since = new Date(Date.now() - DAYS * DAY).toISOString().slice(0, 10);

const releases = parseReleaseList(await (await get(PRESS_URL)).text()).filter(
	(release) => release.date >= since && addsSchoolHolidays(release)
);

const summary: string[] = [];

for (const release of releases) {
	const pdf = parseReleasePage(await (await get(release.url)).text(), release.url);
	const text = (await readCalendar(new Uint8Array(await (await get(pdf)).arrayBuffer()))).join(
		'\n'
	);

	let found;
	try {
		found = parseRelease(text);
	} catch (error) {
		// fails the run, so someone reads the release and adds its days by hand
		throw new Error(`Could not read "${release.title}" (${pdf}): ${(error as Error).message}`, {
			cause: error
		});
	}

	const added = [];
	for (const date of found.dates) {
		if (await add(date, found.name, release.date, release.url)) added.push(date);
	}

	console.log(`${release.title}: ${added.length ? `added ${added.join(', ')}` : 'nothing new'}`);
	if (added.length) {
		summary.push(
			`- [${release.title}](${release.url}), ${release.date} ([PDF](${pdf})): ` +
				`${found.name} on ${added.join(', ')}`
		);
	}
}

if (releases.length === 0) console.log(`No press releases about school holidays since ${since}`);

if (summary.length && summaryFile) {
	const intro = 'Days off school for Penang that the ministry added in a press release:';
	await writeFile(summaryFile, `${intro}\n\n${summary.join('\n')}\n`);
}

/** Adds a day off school to its year, unless a school holiday there already has it */
async function add(date: string, name: string, announced: string, source: string) {
	const file = new URL(`${date.slice(0, 4)}.json`, DATA_DIR);
	const year = JSON.parse(await readFile(file, 'utf8')) as YearHolidays;

	const has = year.holidays.some(
		(h) => h.type === 'school' && h.date <= date && (h.endDate ?? h.date) >= date
	);
	if (has) return false;

	const school = joinDays([
		...year.holidays.filter((h) => h.type === 'school'),
		{ date, name, type: 'school', tentative: false }
	]);
	// by date, a public holiday before a school holiday that starts the same day
	year.holidays = [...year.holidays.filter((h) => h.type !== 'school'), ...school].sort((a, b) =>
		a.date.localeCompare(b.date)
	);
	await writeJson(file, year);

	const press = JSON.parse(await readFile(PRESS_FILE, 'utf8')) as { date: string }[];
	press.push({ date, name, announced, source } as { date: string });
	await writeJson(
		PRESS_FILE,
		press.sort((a, b) => a.date.localeCompare(b.date))
	);

	return true;
}

async function get(url: string): Promise<Response> {
	const response = await fetch(url, {
		headers: { 'user-agent': USER_AGENT },
		signal: AbortSignal.timeout(60_000)
	});
	if (!response.ok) throw new Error(`${url} responded with HTTP ${response.status}`);
	return response;
}

async function writeJson(file: URL, data: unknown) {
	await writeFile(file, JSON.stringify(data, null, '\t') + '\n');
}
