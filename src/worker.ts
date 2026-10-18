import data from '../data/holidays.json' with { type: 'json' };
import type { YearHolidays } from './parse.ts';

const years = data as YearHolidays[];

const HEADERS = {
	'access-control-allow-origin': '*',
	'cache-control': 'public, max-age=86400'
};

export default {
	fetch(request: Request): Response {
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			return json({ error: 'Method not allowed' }, 405);
		}

		const segments = new URL(request.url).pathname.split('/').filter(Boolean);

		if (segments.length === 0) {
			return json({ years: years.map((y) => y.year) });
		}

		const [yearSegment, monthSegment, ...rest] = segments;
		const year = years.find((y) => String(y.year) === yearSegment);

		if (rest.length > 0 || !/^\d{4}$/.test(yearSegment!)) {
			return json({ error: 'Use /{year} or /{year}/{month}, e.g. /2026 or /2026/3' }, 404);
		}

		if (!year) {
			return json(
				{ error: `${yearSegment} is not available`, years: years.map((y) => y.year) },
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

function json(body: unknown, status = 200): Response {
	return Response.json(body, { status, headers: HEADERS });
}
