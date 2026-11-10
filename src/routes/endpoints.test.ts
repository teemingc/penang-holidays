import { expect, test, vi } from 'vitest';
import type { Holiday } from '#lib/holidays.js';
import { GET as getYears } from './years/+server.ts';
import { GET as getYear } from './[year]/+server.ts';
import { GET as getMonth } from './[year]/[month]/+server.ts';

// test caching as deployed since the dev server caches nothing
vi.mock('$app/env', () => ({ dev: false }));

// The handlers only read `params`, so a partial request event is enough
type Event<T extends (...args: never[]) => unknown> = Parameters<T>[0];

// Every field any endpoint returns, so tests can read whichever they need
type Body = {
	holidays?: (Holiday & { originalName?: string })[];
	years?: number[];
	error?: string;
};

async function call(response: Response | Promise<Response>) {
	const res = await response;
	return {
		status: res.status,
		cacheControl: res.headers.get('cache-control'),
		language: res.headers.get('content-language'),
		vary: res.headers.get('vary'),
		body: (await res.json()) as Body
	};
}

function event<T extends (...args: never[]) => unknown>(
	params: Record<string, string>,
	path = '/',
	headers: Record<string, string> = {}
) {
	const url = new URL(path, 'https://example.com');
	return { params, url, request: new Request(url, { headers }) } as unknown as Event<T>;
}

test('lists available years', async () => {
	const { status, body } = await call(getYears({} as Event<typeof getYears>));
	expect(status).toBe(200);
	expect(body.years).toContain(2026);
});

test('returns a year', async () => {
	const { status, body } = await call(getYear(event<typeof getYear>({ year: '2026' })));
	expect(status).toBe(200);
	expect(Object.keys(body)).toEqual(['holidays']);
	expect(body.holidays).toHaveLength(29);
});

test('returns a month, with or without a leading zero', async () => {
	for (const month of ['3', '03']) {
		const { status, body } = await call(getMonth(event<typeof getMonth>({ year: '2026', month })));
		expect(status).toBe(200);
		expect(Object.keys(body)).toEqual(['holidays']);
		expect(body.holidays?.map((h) => [h.date, h.type])).toEqual([
			['2026-03-07', 'state'],
			['2026-03-18', 'school'],
			['2026-03-21', 'federal'],
			['2026-03-21', 'school'],
			['2026-03-22', 'federal']
		]);
	}
});

test('rejects an unknown year', async () => {
	const { status, body } = await call(getYear(event<typeof getYear>({ year: '1999' })));
	expect(status).toBe(404);
	expect(body.years).toContain(2026);
});

test('rejects a path that is not a year', async () => {
	const { status } = await call(getYear(event<typeof getYear>({ year: 'holidays' })));
	expect(status).toBe(404);
});

test('rejects an invalid month', async () => {
	for (const month of ['0', '13', 'abc']) {
		const { status } = await call(getMonth(event<typeof getMonth>({ year: '2026', month })));
		expect(status).toBe(400);
	}
});

test('caches successful responses but not errors', async () => {
	const ok = await call(getYear(event<typeof getYear>({ year: '2026' })));
	const error = await call(getYear(event<typeof getYear>({ year: '1999' })));
	expect(ok.cacheControl).toBe('public, max-age=3600');
	expect(error.cacheControl).toBe('no-store');
});

test('names holidays in English by default', async () => {
	const { body, language, vary } = await call(getYear(event<typeof getYear>({ year: '2026' })));
	expect(language).toBe('en');
	expect(vary).toBe('Accept-Language');
	expect(body.holidays?.find((h) => h.date === '2026-02-17')).toEqual({
		date: '2026-02-17',
		name: 'Chinese New Year',
		originalName: 'Tahun Baru Cina',
		type: 'federal',
		tentative: false
	});
});

test('names holidays in Malay, as published, for ?lang=ms', async () => {
	const { body, language } = await call(
		getYear(event<typeof getYear>({ year: '2026' }, '/2026?lang=ms'))
	);
	expect(language).toBe('ms');
	expect(body.holidays?.find((h) => h.date === '2026-02-17')).toEqual({
		date: '2026-02-17',
		name: 'Tahun Baru Cina',
		type: 'federal',
		tentative: false
	});
});

test('names holidays in the language ?lang= asks for, keeping the original name', async () => {
	const { body, language, vary } = await call(
		getMonth(event<typeof getMonth>({ year: '2026', month: '2' }, '/2026/2?lang=zh'))
	);
	expect(language).toBe('zh-Hans-MY');
	expect(vary).toBeNull();
	expect(body.holidays?.find((h) => h.date === '2026-02-17')).toEqual({
		date: '2026-02-17',
		name: '农历新年',
		originalName: 'Tahun Baru Cina',
		type: 'federal',
		tentative: false
	});
});

test('names holidays in the most preferred language Accept-Language has names in', async () => {
	const cases = [
		['en-GB,en;q=0.9', 'en'],
		['fr-FR,zh-TW;q=0.8,en;q=0.5', 'zh-Hans-MY'],
		['en;q=0.5,ms;q=0.9', 'ms'],
		['fr-FR', 'en']
	];
	for (const [header, expected] of cases) {
		const { language } = await call(
			getYear(event<typeof getYear>({ year: '2026' }, '/2026', { 'accept-language': header! }))
		);
		expect(language).toBe(expected);
	}
});

test('?lang= wins over Accept-Language', async () => {
	const { body } = await call(
		getYear(event<typeof getYear>({ year: '2026' }, '/2026?lang=en', { 'accept-language': 'zh' }))
	);
	expect(body.holidays?.find((h) => h.date === '2026-02-17')?.name).toBe('Chinese New Year');
});

test('rejects a language there are no names in', async () => {
	const { status } = await call(getYear(event<typeof getYear>({ year: '2026' }, '/2026?lang=fr')));
	expect(status).toBe(400);
});

test('returns every type unless asked for some', async () => {
	const { body } = await call(getYear(event<typeof getYear>({ year: '2026' })));
	expect(new Set(body.holidays?.map((h) => h.type))).toEqual(
		new Set(['federal', 'state', 'school'])
	);
});

test('returns only the types ?type= asks for', async () => {
	const school = await call(getYear(event<typeof getYear>({ year: '2026' }, '/2026?type=school')));
	expect(school.body.holidays).toHaveLength(9);
	expect(school.body.holidays?.[3]).toEqual({
		date: '2026-03-18',
		endDate: '2026-03-20',
		name: 'Eid al-Fitr school holidays',
		originalName: 'Cuti Perayaan Hari Raya Aidilfitri',
		type: 'school',
		tentative: false
	});

	const public_ = await call(
		getYear(event<typeof getYear>({ year: '2026' }, '/2026?type=federal,state'))
	);
	expect(public_.body.holidays).toHaveLength(20);

	const state = await call(getYear(event<typeof getYear>({ year: '2026' }, '/2026?type=state')));
	expect(new Set(state.body.holidays?.map((h) => h.type))).toEqual(new Set(['state']));
});

test('returns a school holiday in every month it touches', async () => {
	for (const month of ['5', '6']) {
		const { body } = await call(
			getMonth(event<typeof getMonth>({ year: '2026', month }, `/2026/${month}?type=school`))
		);
		expect(body.holidays?.map((h) => h.originalName)).toEqual(['Cuti Pertengahan Tahun']);
	}

	const july = await call(
		getMonth(event<typeof getMonth>({ year: '2026', month: '7' }, '/2026/7?type=school'))
	);
	expect(july.body.holidays).toEqual([]);
});

test('returns a school holiday that runs into the year from the one before', async () => {
	const over = {
		date: '2025-12-20',
		endDate: '2026-01-11',
		name: 'Year-end school holidays',
		originalName: 'Cuti Akhir Persekolahan',
		type: 'school',
		tentative: false
	};

	const year = await call(getYear(event<typeof getYear>({ year: '2026' }, '/2026?type=school')));
	expect(year.body.holidays?.[0]).toEqual(over);

	const january = await call(
		getMonth(event<typeof getMonth>({ year: '2026', month: '1' }, '/2026/1?type=school'))
	);
	expect(january.body.holidays).toEqual([over]);

	const february = await call(
		getMonth(event<typeof getMonth>({ year: '2026', month: '2' }, '/2026/2?type=school'))
	);
	expect(february.body.holidays?.map((h) => h.date)).toEqual(['2026-02-16', '2026-02-19']);
});

test('rejects a type there are no holidays of', async () => {
	for (const type of ['', 'bank', 'school,bank']) {
		const { status, body } = await call(
			getYear(event<typeof getYear>({ year: '2026' }, `/2026?type=${type}`))
		);
		expect(status).toBe(400);
		expect(body.error).toBe('type must be one or more of federal, state, school');
	}
});
