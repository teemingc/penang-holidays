import type { YearHolidays } from './parse.ts';

export interface Env {
	/** Static assets binding serving the `data/` directory */
	ASSETS: { fetch(input: string): Promise<Response> };
}

// Holidays rarely change, so browsers can reuse a successful response for a day.
// Errors aren't cached, so a year that gets published shows up straight away.
const CACHE_CONTROL = 'public, max-age=86400';

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			return json({ error: 'Method not allowed' }, 405);
		}

		const segments = new URL(request.url).pathname.split('/').filter(Boolean);
		const [yearSegment, monthSegment, ...rest] = segments;

		if (yearSegment === undefined) {
			return json({ years: await asset<number[]>(env, 'years.json') });
		}

		if (rest.length > 0 || !/^\d{4}$/.test(yearSegment)) {
			return json({ error: 'Use /{year} or /{year}/{month}, e.g. /2026 or /2026/3' }, 404);
		}

		const year = await asset<YearHolidays>(env, `${yearSegment}.json`);

		if (!year) {
			return json(
				{
					error: `${yearSegment} is not available`,
					years: await asset<number[]>(env, 'years.json')
				},
				404
			);
		}

		if (monthSegment === undefined) {
			return json(year);
		}

		const month = Number(monthSegment);
		if (!/^\d{1,2}$/.test(monthSegment) || month < 1 || month > 12) {
			return json({ error: 'Month must be between 1 and 12' }, 400);
		}

		const prefix = `${year.year}-${String(month).padStart(2, '0')}-`;
		return json({
			...year,
			month,
			holidays: year.holidays.filter((h) => h.date.startsWith(prefix))
		});
	}
};

async function asset<T>(env: Env, file: string): Promise<T | null> {
	// The assets binding only uses the URL's path
	const response = await env.ASSETS.fetch(`https://assets.local/${file}`);
	return response.ok ? response.json() : null;
}

function json(body: unknown, status = 200): Response {
	return Response.json(body, {
		status,
		headers: {
			'access-control-allow-origin': '*',
			'cache-control': status === 200 ? CACHE_CONTROL : 'no-store'
		}
	});
}
