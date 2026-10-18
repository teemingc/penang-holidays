import { parse, type HTMLElement } from 'node-html-parser';
import type { Holiday, HolidayType, YearHolidays } from '../src/lib/holidays.ts';

const MONTHS = [
	'januari',
	'februari',
	'mac',
	'april',
	'mei',
	'jun',
	'julai',
	'ogos',
	'september',
	'oktober',
	'november',
	'disember'
];

// Same order as `Date.prototype.getUTCDay`
const WEEKDAYS = ['ahad', 'isnin', 'selasa', 'rabu', 'khamis', 'jumaat', 'sabtu'];

const DATE_PATTERN = new RegExp(
	`(\\d{1,2})\\s*(${MONTHS.join('|')})\\b\\s*\\(?\\s*(${WEEKDAYS.join('|')})?`,
	'gi'
);

const TAB_LABEL_PATTERN = /Cuti Umum Tahun\s+(\d{4})/i;
const SECTION_PATTERN = /HARI KELEPASAN AM\s*\((PERSEKUTUAN|NEGERI)\)/i;
const TENTATIVE_PATTERN = /\(\s*\*\s*\)/;
const DAY_COUNT_PATTERN = /\(\s*\d+\s*hari\s*\)/i;

/**
 * Parses every "Cuti Umum Tahun {year}" tab on the portal's public holiday page.
 */
export function parseHolidayPage(html: string, source: string): YearHolidays[] {
	const root = parse(html);
	const years: YearHolidays[] = [];

	for (const link of root.querySelectorAll('a[href^="#sppb-tab-"]')) {
		const label = link.text.match(TAB_LABEL_PATTERN);
		if (!label?.[1]) continue;

		const year = Number(label[1]);
		const pane = root.getElementById(link.getAttribute('href')!.slice(1));
		if (!pane) throw new Error(`Could not find the tab content for ${year}`);

		const holidays = parseYear(pane, year);
		if (holidays.length === 0) throw new Error(`Found no holidays in the ${year} tab`);

		years.push({ year, source, holidays });
	}

	return years.sort((a, b) => a.year - b.year);
}

function parseYear(pane: HTMLElement, year: number): Holiday[] {
	const holidays: Holiday[] = [];

	for (const table of pane.querySelectorAll('table')) {
		if (!SECTION_PATTERN.test(table.text)) continue;

		let type: HolidayType | null = null;

		for (const row of table.querySelectorAll('tr')) {
			const cells = row.querySelectorAll('td');

			if (cells.length < 3) {
				const section = row.text.match(SECTION_PATTERN)?.[1];
				type = section ? (section.toUpperCase() === 'NEGERI' ? 'state' : 'federal') : null;
				continue;
			}

			const rowType = type;
			if (!rowType) continue;

			const names = lines(cells[0]!);
			const dates = parseDates(cells[cells.length - 1]!.text, year);
			if (dates.length === 0) continue;

			if (names.length !== dates.length && names.length !== 1) {
				throw new Error(
					`Could not pair names with dates in ${year}: ${JSON.stringify(names)} / ${JSON.stringify(dates)}`
				);
			}

			dates.forEach((date, i) => {
				const raw = names.length === 1 ? names[0]! : names[i]!;
				const name =
					names.length === 1 && dates.length > 1 ? raw.replace(DAY_COUNT_PATTERN, '') : raw;

				holidays.push({
					date,
					name: clean(name.replace(TENTATIVE_PATTERN, '')),
					type: rowType,
					tentative: TENTATIVE_PATTERN.test(raw)
				});
			});
		}
	}

	return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

function lines(cell: HTMLElement): string[] {
	return cell.structuredText
		.split('\n')
		.map(clean)
		.filter((line) => line !== '' && line !== '-');
}

function clean(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

/**
 * Finds every `{day} {month} ({weekday})` in a cell, checking the weekday when one is given
 * so a mis-paired or mistyped row fails loudly instead of producing a wrong date.
 */
export function parseDates(text: string, year: number): string[] {
	const dates: string[] = [];

	for (const [match, day, month, weekday] of text.matchAll(DATE_PATTERN)) {
		const monthIndex = MONTHS.indexOf(month!.toLowerCase());
		const date = new Date(Date.UTC(year, monthIndex, Number(day)));

		if (date.getUTCMonth() !== monthIndex) {
			throw new Error(`Invalid date "${clean(match)}" in ${year}`);
		}

		if (weekday && WEEKDAYS[date.getUTCDay()] !== weekday.toLowerCase()) {
			throw new Error(
				`"${clean(match)}" in ${year} is a ${WEEKDAYS[date.getUTCDay()]}, not a ${weekday}`
			);
		}

		dates.push(date.toISOString().slice(0, 10));
	}

	return dates;
}
