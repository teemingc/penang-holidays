import { getYear, json, yearNotFound } from '#lib/holidays.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
	const year = getYear(params.year);
	if (!year) return yearNotFound(params.year);

	return json(year);
};
