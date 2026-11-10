import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { addsSchoolHolidays, parseRelease, parseReleaseList, parseReleasePage } from './press.ts';
import { readCalendar } from './school.ts';

const fixture = (file: string) => readFile(new URL(`fixtures/${file}`, import.meta.url));

// The ministry's list of press releases on 11 Nov 2026, cut down to some of March 2026
const releases = parseReleaseList(await fixture('kenyataan-media.html').then(String));
// Its press release of 10 March 2026, adding a day off before Hari Raya Aidilfitri
const pdf = await fixture('kenyataan-media-cuti-tambahan-2026.pdf');
const text = (await readCalendar(new Uint8Array(pdf))).join('\n');

test('reads the list of press releases', () => {
	expect(releases).toHaveLength(6);
	expect(releases.at(-1)).toEqual({
		title: 'Kenyataan Media KPM Berhubung Cuti Tambahan Bersempena Hari Raya Aidilfitri',
		url: 'https://www.moe.gov.my/kenyataan-media-kpm-berhubung-cuti-tambahan-bersem',
		date: '2026-03-10'
	});
});

test('picks out the releases about days off school by their titles', () => {
	expect(releases.filter(addsSchoolHolidays).map((r) => r.date)).toEqual(['2026-03-10']);

	const titled = (title: string) => addsSchoolHolidays({ title, url: '', date: '' });
	expect(titled('Kenyataan Media Tambahan Cuti Perayaan Dan Keputusan Peperiksaan STAM')).toBe(
		true
	);
	expect(titled('Kenyataan Media KPM Berhubung Keputusan Peperiksaan SPM Tahun 2025')).toBe(false);
});

test('finds the PDF a release links to', () => {
	const page = '<a class="doclink btn" href="/storage/files/shares/KM%20Cuti.pdf">Muat turun</a>';
	expect(parseReleasePage(page, 'https://www.moe.gov.my/kenyataan-media-cuti')).toBe(
		'https://www.moe.gov.my/storage/files/shares/KM%20Cuti.pdf'
	);
	expect(() => parseReleasePage('<p>Tiada</p>', 'https://www.moe.gov.my/x')).toThrow(/no PDF/);
});

test('takes the days for every school, and for the group Penang is in', () => {
	expect(parseRelease(text)).toEqual({
		name: 'Cuti Perayaan Hari Raya Aidilfitri',
		// 18 for every school, 19 and 20 for Kumpulan B; Kumpulan A's 19 is the same day
		dates: ['2026-03-18', '2026-03-19', '2026-03-20']
	});
});

test('leaves out the days of the other group', () => {
	const release =
		'Cuti tambahan Hari Deepavali bagi Kumpulan A ialah pada 9 November 2026 (Isnin) ' +
		'dan bagi Kumpulan B pada 10 November 2026 (Selasa).';
	expect(parseRelease(release).dates).toEqual(['2026-11-10']);
});

test('rejects what it cannot be sure of', () => {
	const cases: [string, RegExp][] = [
		['Cuti tambahan pada 18 Mac 2026 (Rabu) kepada semua sekolah.', /found none/],
		[
			'Cuti tambahan Aidilfitri dan Deepavali pada 18 Mac 2026 kepada semua sekolah.',
			/Hari Raya Aidilfitri, Hari Deepavali/
		],
		['Cuti Aidilfitri pada 18 Mac 2026 (Rabu) bagi Sarawak sahaja.', /some states only/],
		['Cuti Aidilfitri pada 18 Mac 2026 (Rabu) diumumkan.', /Could not tell who/],
		['Cuti Aidilfitri pada 18 Mac 2026 (Khamis) kepada semua sekolah.', /is a rabu, not a khamis/],
		['Cuti Aidilfitri akan diumumkan kepada semua sekolah.', /no days off school/]
	];
	for (const [release, error] of cases) expect(() => parseRelease(release)).toThrow(error);
});
