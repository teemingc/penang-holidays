import { getYear } from '#lib/holidays.js';
import { inYear, json, yearNotFound } from '#lib/server/response.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
	const year = getYear(params.year);
	if (!year) return yearNotFound(params.year);

	return json(inYear(year));
};
