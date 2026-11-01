import { expect, test } from 'vitest';
import { years } from './holidays.ts';
import { translate } from './names.ts';

const names = new Set(years.flatMap((y) => y.holidays.map((h) => h.name)));

test.each(['en', 'zh'] as const)('every holiday in data/ has a name in %s', (language) => {
	expect([...names].filter((name) => !translate(name, language))).toEqual([]);
});

test('names New Year by the year it starts', () => {
	expect(translate('Tahun Baru 2027', 'en')).toBe("New Year's Day");
	expect(translate('Tahun Baru 2027', 'zh')).toBe('元旦');
});

test('names a replacement day for the holidays it replaces', () => {
	expect(translate('Cuti Ganti Hari Malaysia', 'en')).toBe('Malaysia Day (observed)');
	expect(translate('Cuti Ganti Hari Malaysia', 'zh')).toBe('马来西亚日补假');
	expect(translate('Cuti Ganti Hari Wesak dan Hari Kebangsaan', 'en')).toBe(
		'Vesak Day and National Day (observed)'
	);
	expect(translate('Cuti Ganti Hari Wesak dan Hari Kebangsaan', 'zh')).toBe('卫塞节及独立日补假');
	expect(translate('Cuti Ganti Hari Wesak dan Hari Baharu', 'en')).toBeUndefined();
});
