import { expect, test } from 'vitest';
import type { YearHolidays } from '#lib/holidays.js';
import { GET as getYears } from './years/+server.ts';
import { GET as getYear } from './[year]/+server.ts';
import { GET as getMonth } from './[year]/[month]/+server.ts';

// The handlers only read `params`, so a partial request event is enough
type Event<T extends (...args: never[]) => unknown> = Parameters<T>[0];

// Every field any endpoint returns, so tests can read whichever they need
type Body = Partial<YearHolidays> & { years?: number[]; month?: number; error?: string };

async function call(response: Response | Promise<Response>) {
	const res = await response;
	return {
		status: res.status,
		cacheControl: res.headers.get('cache-control'),
		body: (await res.json()) as Body
	};
}

test('lists available years', async () => {
	const { status, body } = await call(getYears({} as Event<typeof getYears>));
	expect(status).toBe(200);
	expect(body.years).toContain(2026);
});

test('returns a year', async () => {
	const { status, body } = await call(
		getYear({ params: { year: '2026' } } as Event<typeof getYear>)
	);
	expect(status).toBe(200);
	expect(body.year).toBe(2026);
	expect(body.holidays).toHaveLength(20);
});

test('returns a month, with or without a leading zero', async () => {
	for (const month of ['3', '03']) {
		const { status, body } = await call(
			getMonth({ params: { year: '2026', month } } as Event<typeof getMonth>)
		);
		expect(status).toBe(200);
		expect(body.month).toBe(3);
		expect(body.holidays?.map((h) => h.date)).toEqual(['2026-03-07', '2026-03-21', '2026-03-22']);
	}
});

test('rejects an unknown year', async () => {
	const { status, body } = await call(
		getYear({ params: { year: '1999' } } as Event<typeof getYear>)
	);
	expect(status).toBe(404);
	expect(body.years).toContain(2026);
});

test('rejects a path that is not a year', async () => {
	const { status } = await call(getYear({ params: { year: 'holidays' } } as Event<typeof getYear>));
	expect(status).toBe(404);
});

test('rejects an invalid month', async () => {
	for (const month of ['0', '13', 'abc']) {
		const { status } = await call(
			getMonth({ params: { year: '2026', month } } as Event<typeof getMonth>)
		);
		expect(status).toBe(400);
	}
});

test('caches successful responses but not errors', async () => {
	const ok = await call(getYear({ params: { year: '2026' } } as Event<typeof getYear>));
	const error = await call(getYear({ params: { year: '1999' } } as Event<typeof getYear>));
	expect(ok.cacheControl).toBe('public, max-age=3600');
	expect(error.cacheControl).toBe('no-store');
});
