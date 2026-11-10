import { extractText } from 'unpdf';
import type { Holiday } from '../src/lib/holidays.ts';
import press from './press-releases.json' with { type: 'json' };

// A break is its name on one line, CUTI PENGGAL 1, TAHUN 2026, then the number of weeks it
// makes, on a line of its own or the end of that one, then its first and last day and how many
// days that is: 21.03.2026 - 29.03.2026 9
const BREAK_PATTERN =
	/^CUTI (.+?)(?: \d)?\n(?:\d+\n)?(\d{2})\.(\d{2})\.(\d{4}) ?- ?(\d{2})\.(\d{2})\.(\d{4}) (\d+)$/gm;

const DAY = 24 * 60 * 60 * 1000;

type ByHand = Omit<Holiday, 'type' | 'tentative'>;

/**
 * School holidays in Penang that can't be read from a calendar, copied from it by hand.
 *
 * Mostly the days off school around a festival that the ministry adds to the public holidays:
 * the calendar's table of them (Lampiran C) comes out of the PDF with its columns run together.
 * With them are the breaks of the 2023/2024 session, whose calendar is a scan with no text in it.
 * The days the ministry has added since in a press release are in press-releases.json.
 */
const BY_HAND: Record<number, ByHand[]> = {
	2023: [
		{ date: '2023-01-20', name: 'Cuti Perayaan Tahun Baru Cina' },
		{ date: '2023-04-20', endDate: '2023-04-21', name: 'Cuti Perayaan Hari Raya Aidilfitri' },
		{ date: '2023-04-22', endDate: '2023-04-30', name: 'Cuti Pertengahan Penggal 1' },
		{ date: '2023-05-27', endDate: '2023-06-04', name: 'Cuti Penggal 1' },
		{ date: '2023-06-28', name: 'Cuti Perayaan Hari Raya Qurban' },
		{ date: '2023-06-30', name: 'Cuti Perayaan Hari Raya Qurban' },
		{ date: '2023-08-26', endDate: '2023-09-03', name: 'Cuti Penggal 2' },
		{ date: '2023-11-14', name: 'Cuti Perayaan Hari Deepavali' },
		{ date: '2023-12-16', endDate: '2024-01-01', name: 'Cuti Penggal 3' }
	],
	2024: [
		{ date: '2024-02-09', name: 'Cuti Perayaan Tahun Baru Cina' },
		{ date: '2024-02-10', endDate: '2024-03-10', name: 'Cuti Akhir Persekolahan' },
		{ date: '2024-04-08', endDate: '2024-04-09', name: 'Cuti Perayaan Hari Raya Aidilfitri' },
		{ date: '2024-04-12', name: 'Cuti Perayaan Hari Raya Aidilfitri' },
		{ date: '2024-10-30', name: 'Cuti Perayaan Hari Deepavali' },
		{ date: '2024-11-01', name: 'Cuti Perayaan Hari Deepavali' }
	],
	2025: [
		{ date: '2025-04-02', endDate: '2025-04-04', name: 'Cuti Perayaan Hari Raya Aidilfitri' },
		{ date: '2025-10-21', endDate: '2025-10-22', name: 'Cuti Perayaan Hari Deepavali' }
	],
	2026: [
		{ date: '2026-02-16', name: 'Cuti Perayaan Tahun Baru Cina' },
		{ date: '2026-02-19', endDate: '2026-02-20', name: 'Cuti Perayaan Tahun Baru Cina' },
		{ date: '2026-03-19', endDate: '2026-03-20', name: 'Cuti Perayaan Hari Raya Aidilfitri' },
		{ date: '2026-11-10', name: 'Cuti Perayaan Hari Deepavali' }
	]
};

/** The text of each page of one of the ministry's academic calendars */
export async function readCalendar(pdf: Uint8Array): Promise<string[]> {
	return (await extractText(pdf)).text;
}

/**
 * The breaks between terms in Penang, from the pages of a calendar for the states Penang is
 * grouped with. A calendar is for a year, or before 2026 for a session that ran from one year
 * into the next, so its breaks can be in either.
 */
export function parseSchoolCalendar(pages: string[]): ByHand[] {
	// the page of festive days names Penang too, but has no breaks
	const breaks = pages
		.filter((page) => /Pulau\s+Pinang/.test(page))
		.flatMap((page) => [...page.matchAll(BREAK_PATTERN)]);
	if (breaks.length === 0) throw new Error('Found no school breaks for Pulau Pinang');

	return breaks.map(([match, title, d1, m1, y1, d2, m2, y2, days]) => {
		const [date, endDate] = [`${y1}-${m1}-${d1}`, `${y2}-${m2}-${d2}`];
		const length = (Date.parse(endDate) - Date.parse(date)) / DAY + 1;

		// checked against the count the calendar gives, so a mistyped date fails loudly
		if (length !== Number(days)) {
			throw new Error(`"${match.replace(/\n/g, ' ')}" is ${length} days, not ${days}`);
		}

		return { date, endDate, name: breakName(title!) };
	});
}

/**
 * The school holidays in Penang that start in a year: the breaks in the calendars that cover
 * it, the ones copied by hand, and the days added in press releases. One that runs into the
 * next year is only in the year it starts.
 */
export function schoolHolidays(calendars: string[][], year: number): Holiday[] {
	const breaks = calendars.flatMap(parseSchoolCalendar);
	const added = press.map(({ date, name }) => ({ date, name }));

	return joinDays(
		[...breaks, ...(BY_HAND[year] ?? []), ...added]
			.filter((holiday) => holiday.date.startsWith(`${year}-`))
			.map((holiday) => ({ ...holiday, type: 'school' as const, tentative: false }))
	);
}

/**
 * Holidays by date, with those of one name that run on from each other made one: 19 to 20 March
 * with 18 March added is 18 to 20 March
 */
export function joinDays(holidays: Holiday[]): Holiday[] {
	const joined: Holiday[] = [];

	for (const holiday of holidays.toSorted((a, b) => a.date.localeCompare(b.date))) {
		const before = joined.findLast((h) => h.name === holiday.name && h.type === holiday.type);
		const end = holiday.endDate ?? holiday.date;

		if (before && Date.parse(holiday.date) <= Date.parse(before.endDate ?? before.date) + DAY) {
			if (end > (before.endDate ?? before.date)) before.endDate = end;
		} else {
			// endDate goes after date, as in the files
			const { date, endDate, ...rest } = holiday;
			joined.push({ date, ...(endDate && { endDate }), ...rest });
		}
	}

	return joined;
}

// PENGGAL 1, TAHUN 2026 and PENGGAL 1, SESI 2025/2026 are Cuti Penggal 1,
// and PERTENGAHAN TAHUN 2026 is Cuti Pertengahan Tahun
function breakName(title: string): string {
	const name = title
		.replace(/(?<!PERTENGAHAN),? (?:TAHUN|SESI) [\d/]+$/, '')
		.replace(/ \d{4}$/, '');
	return `Cuti ${name.toLowerCase().replace(/\b\p{L}/gu, (letter) => letter.toUpperCase())}`;
}
