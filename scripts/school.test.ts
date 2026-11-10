import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { joinDays, parseSchoolCalendar, readCalendar, schoolHolidays } from './school.ts';

const read = async (file: string) =>
	readCalendar(new Uint8Array(await readFile(new URL(`fixtures/${file}`, import.meta.url))));

// The ministry's Kalendar Akademik 2026, downloaded on 11 Nov 2026
const year = await read('kalendar-akademik-2026.pdf');
// Its Kalendar Akademik Sesi 2024/2025, as the Wayback Machine had it on 7 Dec 2023
const session = await read('kalendar-akademik-2024-2025.pdf');

test('parses the breaks between terms for Penang', () => {
	expect(parseSchoolCalendar(year)).toEqual([
		{ date: '2026-03-21', endDate: '2026-03-29', name: 'Cuti Penggal 1' },
		{ date: '2026-05-23', endDate: '2026-06-07', name: 'Cuti Pertengahan Tahun' },
		{ date: '2026-08-29', endDate: '2026-09-06', name: 'Cuti Penggal 2' },
		{ date: '2026-12-05', endDate: '2026-12-31', name: 'Cuti Akhir Persekolahan' }
	]);
});

test('parses a session that runs into the next year', () => {
	expect(parseSchoolCalendar(session)).toEqual([
		{ date: '2024-05-25', endDate: '2024-06-02', name: 'Cuti Penggal 1' },
		{ date: '2024-09-14', endDate: '2024-09-22', name: 'Cuti Penggal 2' },
		// written 21.12.2024 -29.12.2024
		{ date: '2024-12-21', endDate: '2024-12-29', name: 'Cuti Penggal 3' },
		// its session is written 20242025
		{ date: '2025-01-18', endDate: '2025-02-16', name: 'Cuti Akhir Persekolahan' }
	]);
});

test('reads the number of weeks at the end of the name', () => {
	const page = 'Pulau Pinang\nCUTI PENGGAL 3, SESI 2022/2023 3\n10.12.2022 - 31.12.2022 22';
	expect(parseSchoolCalendar([page])[0]?.name).toBe('Cuti Penggal 3');
});

test('keeps the holidays that start in the year, with the ones copied by hand', () => {
	const holidays = schoolHolidays([year], 2026);

	expect(holidays).toHaveLength(8);
	expect(holidays[0]).toEqual({
		date: '2026-02-16',
		name: 'Cuti Perayaan Tahun Baru Cina',
		type: 'school',
		tentative: false
	});
	expect(holidays.map((h) => h.date)).toEqual(holidays.map((h) => h.date).sort());

	expect(schoolHolidays([session], 2025).map((h) => h.name)).toEqual([
		'Cuti Akhir Persekolahan',
		'Cuti Perayaan Hari Raya Aidilfitri',
		'Cuti Perayaan Hari Deepavali'
	]);
});

test('joins a day added in a press release to the days it runs on from', () => {
	const aidilfitri = schoolHolidays([year], 2026).find((h) => h.name.includes('Aidilfitri'));
	expect([aidilfitri?.date, aidilfitri?.endDate]).toEqual(['2026-03-18', '2026-03-20']);
});

test('joins holidays of one name that run on, and no others', () => {
	const day = (date: string, name = 'Cuti Perayaan Hari Deepavali', endDate?: string) => ({
		date,
		...(endDate && { endDate }),
		name,
		type: 'school' as const,
		tentative: false
	});

	expect(
		joinDays([
			day('2024-11-01'),
			day('2024-10-30'),
			day('2024-10-31'),
			day('2024-11-02', 'Cuti Penggal 3', '2024-11-09'),
			day('2024-11-04')
		]).map((h) => [h.date, h.endDate])
	).toEqual([
		['2024-10-30', '2024-11-01'],
		['2024-11-02', '2024-11-09'],
		['2024-11-04', undefined]
	]);
});

test('rejects a break whose dates do not match its count of days', () => {
	const page = 'Pulau Pinang\nCUTI PENGGAL 1, TAHUN 2026\n1\n21.03.2026 - 29.03.2026 10';
	expect(() => parseSchoolCalendar([page])).toThrow(/is 9 days, not 10/);
});

test('rejects a calendar without breaks for Penang', () => {
	expect(() => parseSchoolCalendar(['Lampiran C\nPulau Pinang'])).toThrow(/Found no/);
});
