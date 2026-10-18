import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import worker, { type Env } from '../src/worker.ts';

// Stands in for Cloudflare's static assets binding, serving the real data/ directory
const env: Env = {
	ASSETS: {
		async fetch(input) {
			const file = new URL(`../data${new URL(input).pathname}`, import.meta.url);
			try {
				return new Response(await readFile(file));
			} catch {
				return new Response('Not found', { status: 404 });
			}
		}
	}
};

async function get(path: string) {
	const response = await worker.fetch(new Request(`https://example.com${path}`), env);
	return {
		status: response.status,
		cacheControl: response.headers.get('cache-control'),
		body: await response.json()
	};
}

test('caches successful responses but not errors', async () => {
	assert.equal((await get('/2026')).cacheControl, 'public, max-age=3600');
	assert.equal((await get('/1999')).cacheControl, 'no-store');
});

test('lists available years', async () => {
	const { status, body } = await get('/');
	assert.equal(status, 200);
	assert.ok(body.years.includes(2026));
});

test('returns a year', async () => {
	const { status, body } = await get('/2026');
	assert.equal(status, 200);
	assert.equal(body.year, 2026);
	assert.equal(body.holidays.length, 20);
});

test('returns a month', async () => {
	const { status, body } = await get('/2026/3');
	assert.equal(status, 200);
	assert.equal(body.month, 3);
	assert.deepEqual(
		body.holidays.map((h: { date: string }) => h.date),
		['2026-03-07', '2026-03-21', '2026-03-22']
	);
});

test('accepts a zero-padded month', async () => {
	const { body } = await get('/2026/03');
	assert.equal(body.holidays.length, 3);
});

test('rejects an unknown year', async () => {
	const { status } = await get('/1999');
	assert.equal(status, 404);
});

test('rejects an invalid month', async () => {
	assert.equal((await get('/2026/13')).status, 400);
	assert.equal((await get('/2026/abc')).status, 400);
});

test('rejects unknown paths', async () => {
	assert.equal((await get('/holidays')).status, 404);
	assert.equal((await get('/2026/3/1')).status, 404);
});
