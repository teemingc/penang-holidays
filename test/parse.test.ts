import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parseDates, parseHolidayPage } from '../src/parse.ts';

// Snapshot of the portal page taken on 17 Oct 2026
const html = await readFile(new URL('fixtures/info-cuti-umum.html', import.meta.url), 'utf8');
const years = parseHolidayPage(html, 'https://example.com');

test('finds every year tab', () => {
	assert.deepEqual(
		years.map((y) => [y.year, y.holidays.length]),
		[
			[2023, 19],
			[2024, 19],
			[2025, 19],
			[2026, 20]
		]
	);
});

test('parses the 2026 tab', () => {
	const holidays = years.find((y) => y.year === 2026)!.holidays;

	assert.deepEqual(
		holidays.map((h) => h.date),
		[
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
		]
	);

	assert.deepEqual(holidays[5], {
		date: '2026-03-21',
		name: 'Hari Raya Puasa',
		type: 'federal',
		tentative: true
	});

	assert.deepEqual(holidays[14], {
		date: '2026-07-11',
		name: 'Hari Jadi Tuan Yang Terutama Yang di-Pertua Negeri Pulau Pinang',
		type: 'state',
		tentative: false
	});
});

test('repeats a single name across a multi-day row', () => {
	const holidays = years.find((y) => y.year === 2026)!.holidays;
	assert.deepEqual(
		holidays.filter((h) => h.name === 'Tahun Baru Cina').map((h) => h.date),
		['2026-02-17', '2026-02-18']
	);
});

test('keeps holidays that share a date', () => {
	const holidays = years.find((y) => y.year === 2024)!.holidays;
	assert.deepEqual(
		holidays.filter((h) => h.date === '2024-07-07').map((h) => h.type),
		['federal', 'state']
	);
});

test('tolerates a missing opening parenthesis', () => {
	assert.deepEqual(parseDates('22 Mei Rabu)', 2024), ['2024-05-22']);
});

test('rejects a weekday that does not match the date', () => {
	assert.throws(() => parseDates('17 Februari (Isnin)', 2026), /is a selasa, not a Isnin/);
});
