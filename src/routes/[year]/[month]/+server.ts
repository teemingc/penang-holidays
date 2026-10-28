import { getYear } from '#lib/holidays.js';
import { inMonth, json, yearNotFound } from '#lib/server/response.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
	const year = getYear(params.year);
	if (!year) return yearNotFound(params.year);

	const month = Number(params.month);
	if (!/^\d{1,2}$/.test(params.month) || month < 1 || month > 12) {
		return json({ error: 'Month must be between 1 and 12' }, 400);
	}

	return json(inMonth(year, month));
};
