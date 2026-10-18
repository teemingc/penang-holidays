import { writeFile } from 'node:fs/promises';
import { parseHolidayPage } from './parse.ts';

const SOURCE_URL = 'https://www.penang.gov.my/index.php/component/sppagebuilder/page/50';
const DATA_DIR = new URL('../data/', import.meta.url);

// The portal returns HTTP 500 to clients without a browser user agent
const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const requested = process.argv.slice(2).map(Number);

const published = parseHolidayPage(await fetchPage(), SOURCE_URL);
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
	await writeJson(`${year.year}.json`, year);
	console.log(`data/${year.year}.json: ${year.holidays.length} holidays`);
}

// The portal is slow and drops connections now and then, so retry a few times
async function fetchPage(attempts = 4): Promise<string> {
	for (let attempt = 1; ; attempt++) {
		try {
			const response = await fetch(SOURCE_URL, {
				headers: { 'user-agent': USER_AGENT },
				signal: AbortSignal.timeout(180_000)
			});

			if (!response.ok) {
				throw new Error(`${SOURCE_URL} responded with HTTP ${response.status}`);
			}

			return await response.text();
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
