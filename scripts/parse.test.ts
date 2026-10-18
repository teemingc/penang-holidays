import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { parseDates, parseHolidayPage } from './parse.ts';

// Snapshot of the portal page taken on 17 Oct 2026
const html = await readFile(new URL('fixtures/info-cuti-umum.html', import.meta.url), 'utf8');
const years = parseHolidayPage(html);

function holidaysIn(year: number) {
	return years.find((y) => y.year === year)!.holidays;
}

test('finds every year tab', () => {
	expect(years.map((y) => [y.year, y.holidays.length])).toEqual([
		[2023, 19],
		[2024, 19],
		[2025, 19],
		[2026, 20]
	]);
});

test('parses the 2026 tab', () => {
	const holidays = holidaysIn(2026);

	expect(holidays.map((h) => h.date)).toEqual([
		'2026-01-01',
		'2026-02-01',
		'2026-02-17',
		'2026-02-18',
		'2026-03-07',
		'2026-03-21',
		'2026-03-22',
		'2026-05-01',
		'2026-05-27',
		'2026-05-31',
		'2026-06-01',
		'2026-06-02',
		'2026-06-17',
		'2026-07-07',
		'2026-07-11',
		'2026-08-25',
		'2026-08-31',
		'2026-09-16',
		'2026-11-08',
		'2026-12-25'
	]);

	expect(holidays[5]).toEqual({
		date: '2026-03-21',
		name: 'Hari Raya Puasa',
		type: 'federal',
		tentative: true
	});

	expect(holidays[14]).toEqual({
		date: '2026-07-11',
		name: 'Hari Jadi Tuan Yang Terutama Yang di-Pertua Negeri Pulau Pinang',
		type: 'state',
		tentative: false
	});
});

test('repeats a single name across a multi-day row', () => {
	expect(
		holidaysIn(2026)
			.filter((h) => h.name === 'Tahun Baru Cina')
			.map((h) => h.date)
	).toEqual(['2026-02-17', '2026-02-18']);
});

test('keeps holidays that share a date', () => {
	expect(
		holidaysIn(2024)
			.filter((h) => h.date === '2024-07-07')
			.map((h) => h.type)
	).toEqual(['federal', 'state']);
});

test('tolerates a missing opening parenthesis', () => {
	expect(parseDates('22 Mei Rabu)', 2024)).toEqual(['2024-05-22']);
});

test('rejects a weekday that does not match the date', () => {
	expect(() => parseDates('17 Februari (Isnin)', 2026)).toThrow(/is a selasa, not a Isnin/);
});
