import { getYear, json, yearNotFound } from '#lib/holidays.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
	const year = getYear(params.year);
	if (!year) return yearNotFound(params.year);

	const month = Number(params.month);
	if (!/^\d{1,2}$/.test(params.month) || month < 1 || month > 12) {
		return json({ error: 'Month must be between 1 and 12' }, 400);
	}

	const prefix = `${year.year}-${String(month).padStart(2, '0')}-`;
	return json({
		...year,
		month,
		holidays: year.holidays.filter((h) => h.date.startsWith(prefix))
	});
};
