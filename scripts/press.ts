// The ministry's press releases that add days off school after a calendar is out
import { parse } from 'node-html-parser';

export const PRESS_URL = 'https://www.moe.gov.my/kenyataan-media';

/**
 * An address on the ministry's own site, over https, or an error. The list and the pages it
 * links to say where to go next, and nothing they say is followed anywhere else
 */
export function onMinistrySite(address: string, base?: string): string {
	const url = new URL(address, base);
	if (url.protocol !== 'https:' || url.hostname !== 'www.moe.gov.my') {
		throw new Error(`${url.href} is not on the ministry's site`);
	}
	return url.href;
}

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

// The festivals the ministry adds days off around, as its calendar spells them
const FESTIVALS: [RegExp, string][] = [
	[/Tahun Baru Cina/i, 'Tahun Baru Cina'],
	[/Aidilfitri/i, 'Hari Raya Aidilfitri'],
	[/Aidiladha|Qurban|Korban/i, 'Hari Raya Qurban'],
	[/Deepavali/i, 'Hari Deepavali']
];

// One or more days of a month, with the weekdays after if they're given:
// 18 Mac 2026 (Rabu), or 19 dan 20 Mac 2026 (Khamis dan Jumaat)
const DAYS_PATTERN = new RegExp(
	`((?:\\d{1,2}\\s*(?:,|dan|&)\\s*)*\\d{1,2})\\s+(${MONTHS.join('|')})\\s+(\\d{4})(?:\\s*\\(([^)]*)\\))?`,
	'gi'
);

export interface Release {
	title: string;
	url: string;
	/** ISO date it was put out */
	date: string;
}

/** Every press release in the ministry's list, which is a table of titles and dates */
export function parseReleaseList(html: string): Release[] {
	const rows = parse(html).querySelectorAll('table#example tbody tr');
	if (rows.length === 0) throw new Error('Found no press releases in the list');

	return rows.map((row) => {
		const link = row.querySelector('a');
		const [, day, month, year] =
			row
				.querySelectorAll('td')
				.at(-1)
				?.text.match(/(\d{1,2})\s+(\p{L}+)\s+(\d{4})/u) ?? [];
		// the list shortens months to three letters, like Okt
		const monthIndex = MONTHS.findIndex((m) => month && m.startsWith(month.toLowerCase()));
		const url = link?.getAttribute('href');

		if (!link || !url || monthIndex < 0) {
			throw new Error(`Could not read the press release "${row.text.replace(/\s+/g, ' ').trim()}"`);
		}

		return {
			title: link.text.replace(/\s+/g, ' ').trim(),
			url: onMinistrySite(url, PRESS_URL),
			date: iso(year!, monthIndex, day!)
		};
	});
}

/** A release about days off school, by its title, like Cuti Tambahan Bersempena Hari Raya Aidilfitri */
export function addsSchoolHolidays({ title }: Release): boolean {
	return /\bcuti\b/i.test(title) && /tambahan|perayaan|sekolah/i.test(title);
}

/** The address of the PDF a release's page links to */
export function parseReleasePage(html: string, url: string): string {
	const href = parse(html).querySelector('a.doclink[href$=".pdf"]')?.getAttribute('href');
	if (!href) throw new Error(`Found no PDF on ${url}`);
	return onMinistrySite(href, url);
}

/**
 * The days off school a press release gives for Penang, named for the festival they're around.
 *
 * Only the wording the ministry has used so far is read: a sentence about cuti that gives its
 * days to every school (semua sekolah, seluruh negara), or to the groups of states by name,
 * where Penang's are the days after Kumpulan B. Anything else is an error rather than a guess:
 * days for some states only (sahaja, kecuali), no days at all, or no one festival.
 */
export function parseRelease(text: string): { name: string; dates: string[] } {
	const prose = text.replace(/\s+/g, ' ');

	const festivals = FESTIVALS.filter(([pattern]) => pattern.test(prose));
	if (festivals.length !== 1) {
		throw new Error(
			`Expected one festival, found ${festivals.map(([, name]) => name).join(', ') || 'none'}`
		);
	}

	const dates = new Set<string>();

	for (const sentence of prose.split(/(?<=\.)\s+(?=\p{Lu})/u)) {
		if (!/\bcuti\b/i.test(sentence) || !sentence.match(DAYS_PATTERN)) continue;

		if (/\b(sahaja|kecuali)\b/i.test(sentence)) {
			throw new Error(`Days for some states only, in "${sentence}"`);
		}

		// by group, the sentence is cut at each group's name and Penang's part is what follows Kumpulan B
		const parts = sentence.split(/(?=Kumpulan [AB]\b)/);
		const everyone = parts.length === 1 && /semua sekolah|seluruh negara/i.test(sentence);
		if (parts.length === 1 && !everyone) throw new Error(`Could not tell who "${sentence}" is for`);

		for (const part of everyone ? parts : parts.filter((p) => p.startsWith('Kumpulan B'))) {
			for (const date of parseDays(part)) dates.add(date);
		}
	}

	if (dates.size === 0) throw new Error('Found no days off school for Penang');

	return { name: `Cuti Perayaan ${festivals[0]![1]}`, dates: [...dates].sort() };
}

// checks the weekdays when there's one for each day, so a mistyped date fails loudly
function parseDays(text: string): string[] {
	return [...text.matchAll(DAYS_PATTERN)].flatMap(([match, days, month, year, weekdays]) => {
		const monthIndex = MONTHS.indexOf(month!.toLowerCase());
		const named = weekdays
			?.toLowerCase()
			.match(/\p{L}+/gu)
			?.filter((w) => WEEKDAYS.includes(w));

		return days!.match(/\d+/g)!.map((day, i, all) => {
			const date = new Date(Date.UTC(Number(year), monthIndex, Number(day)));
			if (date.getUTCMonth() !== monthIndex) throw new Error(`Invalid date in "${match}"`);

			const weekday = named?.length === all.length ? named[i] : undefined;
			if (weekday && WEEKDAYS[date.getUTCDay()] !== weekday) {
				throw new Error(
					`${day} in "${match}" is a ${WEEKDAYS[date.getUTCDay()]}, not a ${weekday}`
				);
			}

			return date.toISOString().slice(0, 10);
		});
	});
}

function iso(year: string, monthIndex: number, day: string): string {
	return new Date(Date.UTC(Number(year), monthIndex, Number(day))).toISOString().slice(0, 10);
}
